import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import {
  Badge,
  IconButton,
  ScreenHeader,
  SurfaceCard,
} from "@/components/bionis-ui";
import { TutorMessageCard, UploadCard } from "@/components/tutor-components";
import { useColors } from "@/hooks/use-colors";
import { useLearnerData } from "@/lib/learner-context";
import { SUBJECTS } from "@/lib/app-data";
import { ro } from "@/lib/i18n";
import { generateLearningPdf } from "@/lib/pdf";
import {
  clearPendingUpload,
  loadPendingUpload,
  savePendingUpload,
  type PendingUpload,
} from "@/lib/storage";
import {
  createMessageId,
  revealSlowly,
  TUTOR_MODES,
  type TutorMessage,
  type TutorMode,
} from "@/services/ai-service";
import { getApiBaseUrl } from "@/constants/api";
import { trpc } from "@/lib/trpc";
import { diagramSvg } from "@/lib/diagrams";
import type { TutorDiagram } from "@/shared/tutor-diagram";

const INITIAL_MESSAGE: TutorMessage = {
  id: "welcome",
  role: "assistant",
  mode: "guided",
  createdAt: Date.now(),
  text: "## Începem cu primul pas\n\nScrie enunțul exact sau spune-mi ce ai încercat. Nu îți dau rezultatul din prima. Vreau să înțeleg cum gândești și să îți pun întrebarea potrivită.",
};

function currentTimestamp(): number {
  return Date.now();
}

async function readBase64(uri: string): Promise<string> {
  if (Platform.OS !== "web") return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const response = await fetch(uri);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export default function TutorScreen() {
  const colors = useColors();
  const { recordQuestion, state: learnerState } = useLearnerData();
  const params = useLocalSearchParams<{ autoUpload?: string }>();
  const [subject, setSubject] = useState(SUBJECTS[0].label);
  const [agent, setAgent] = useState("Ghid socratic");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<TutorMessage[]>([INITIAL_MESSAGE]);
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<TutorMode>("guided");
  const [upload, setUpload] = useState<PendingUpload | null>(null);
  const [notice, setNotice] = useState<string>(ro.slowReply);
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [showVoiceDisclosure, setShowVoiceDisclosure] = useState(false);
  const [recording, setRecording] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const assistantMutation = trpc.assistant.chat.useMutation();
  const voiceMutation = trpc.assistant.transcribe.useMutation();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  useEffect(() => {
    if (Platform.OS === "web") {
      void clearPendingUpload();
      return;
    }
    void loadPendingUpload().then(setUpload);
  }, [params.autoUpload]);
  const history = useMemo(
    () => messages.map(({ role, text }) => ({ role, text })),
    [messages],
  );

  async function addReply(
    reply: {
      text: string;
      provider: "live";
      model?: string;
      diagram?: TutorDiagram;
      analysis?: TutorMessage["analysis"];
    },
    requestedMode: TutorMode,
  ) {
    const id = createMessageId("assistant");
    const next: TutorMessage = {
      id,
      role: "assistant",
      text: "",
      mode: requestedMode,
      provider: reply.provider,
      model: reply.model,
      ...(reply.diagram ? { diagram: reply.diagram } : {}),
      ...(reply.analysis ? { analysis: reply.analysis } : {}),
      createdAt: currentTimestamp(),
    };
    setMessages((current) => [...current, next]);
    setNotice(`${ro.liveTutor} · ${reply.model ?? "model AI"} · răspunsul este afișat treptat.${reply.analysis?.confidence !== undefined && reply.analysis.confidence >= 0.8 && reply.analysis.subject !== "necunoscut" ? ` Materie detectată: ${reply.analysis.subject}.` : ""}`);
    await revealSlowly(reply.text, (partial) =>
      setMessages((current) =>
        current.map((message) =>
          message.id === id ? { ...message, text: partial } : message,
        ),
      ),
    );
  }
  async function submitQuestion(text: string, requestedMode: TutorMode = mode) {
    const question = text.trim();
    if ((!question && !upload) || pending) return;
    const questionText = question || `Ajută-mă să înțeleg tema atașată (${upload?.name}).`;
    setInput("");
    setPending(true);
    const userMessage: TutorMessage = {
      id: createMessageId("user"),
      role: "user",
      text: questionText,
      mode: requestedMode,
      createdAt: currentTimestamp(),
    };
    setMessages((current) => [...current, userMessage]);
    let recordedQuestion = false;
    try {
      const live = await assistantMutation.mutateAsync({
        subject,
        mode: requestedMode,
        question: questionText,
        learnerLevel: learnerState.preferences?.level,
        explanationStyle: learnerState.preferences?.explanationStyle,
        messages: history.slice(-12),
        ...(upload ? {
          attachment: {
            name: upload.name,
            mimeType: (upload.mimeType ?? "text/plain") as "image/png" | "image/jpeg" | "application/pdf" | "text/plain",
            base64: await readBase64(upload.uri),
          },
        } : {}),
      });
      const confidentSubject = live.analysis && live.analysis.confidence >= 0.8 && live.analysis.subject !== "necunoscut"
        ? live.analysis.subject
        : null;
      const effectiveSubject = confidentSubject ?? subject;
      if (confidentSubject) setSubject(confidentSubject);
      recordQuestion(effectiveSubject);
      recordedQuestion = true;
      const pdfReply: TutorMessage = {
        id: createMessageId("mastery-pdf"),
        role: "assistant",
        text: `Enunțul elevului: ${questionText}\n\n${live.text}`,
        mode: requestedMode,
        provider: live.provider,
        model: live.model,
        ...(live.diagram ? { diagram: live.diagram } : {}),
        analysis: live.analysis,
        createdAt: currentTimestamp(),
      };
      await addReply(live, requestedMode);
      if (requestedMode === "check" && live.analysis?.mastery === "demonstrated") {
        await exportPdf([pdfReply], effectiveSubject);
      }
      if (upload) {
        setUpload(null);
        await clearPendingUpload();
      }
    } catch (error) {
      if (!recordedQuestion) recordQuestion(subject);
      const detail = error instanceof Error ? error.message : "Eroare necunoscută";
      console.error("[Tutor] AI request failed", detail);
      const networkFailure =
        /fetch|network|timeout|failed to connect/i.test(detail);
      setNotice(
        networkFailure
          ? Platform.OS === "web"
            ? `Nu mă pot conecta la serverul AI (${getApiBaseUrl()}). Verifică dacă originea exactă a site-ului este permisă în CORS_ALLOWED_ORIGINS pe serverul API.`
            : `Nu mă pot conecta la serverul AI (${getApiBaseUrl()}). Verifică internetul și dacă serviciul Render este pornit, apoi încearcă din nou.`
          : `Cererea nu a putut fi procesată: ${detail}.`,
      );
    } finally {
      setPending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }
  function handleQuickAction(action: TutorMode) {
    setMode(action);
    const prompts: Partial<Record<TutorMode, string>> = {
      hint: "Am nevoie de un indiciu pentru problema trimisă.",
      concept: "Explică-mi ideea principală, apoi pune-mi o întrebare.",
      example:
        "Arată-mi un exemplu asemănător, dar oprește-te înainte de rezultat.",
      check: "Verifică ultimul meu pas și spune-mi ce să verific.",
      practice: "Dă-mi un exercițiu asemănător pe care să îl încerc singur.",
      summary: "Fă o recapitulare și pune-mi un mini-quiz.",
    };
    submitQuestion(prompts[action] ?? "Ajută-mă cu următorul pas.", action);
  }
  async function toggleVoice() {
    try {
      if (!recording) {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
          setNotice(
            "Microfonul nu a fost autorizat. Poți scrie mesajul în caseta de mai jos.",
          );
          return;
        }
        await recorder.prepareToRecordAsync();
        recorder.record();
        setRecording(true);
        setNotice(
          "Înregistrarea este activă. Spune un singur pas sau o singură întrebare.",
        );
      } else {
        await recorder.stop();
        setRecording(false);
        if (!recorderState.url) {
          setNotice("Înregistrarea nu a fost salvată. Încearcă din nou.");
          return;
        }
        setNotice("Transcriu nota vocală în limba română…");
        try {
          let base64: string;
          let mimeType = "audio/mp4";
          if (Platform.OS === "web") {
            const response = await fetch(recorderState.url);
            mimeType = response.headers.get("content-type")?.split(";")[0] ?? "audio/webm";
            const bytes = new Uint8Array(await response.arrayBuffer());
            let binary = "";
            for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
            base64 = btoa(binary);
          } else base64 = await readBase64(recorderState.url);
          const transcript = await voiceMutation.mutateAsync({ base64, mimeType });
          setInput(transcript.text);
          setShowVoiceDisclosure(false);
          setNotice("Transcrierea este gata. Verifică textul, apoi trimite-l tutorului.");
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Eroare necunoscută";
          setNotice(`Transcrierea a eșuat: ${reason}`);
        }
      }
    } catch {
      setRecording(false);
      setNotice(
        "Înregistrarea vocală nu este disponibilă pe acest dispozitiv.",
      );
    }
  }
  async function exportPdf(additionalMessages: TutorMessage[] = [], pdfSubject = subject) {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const exportMessages = [...messages, ...additionalMessages];
      const tutorNotes = exportMessages
        .filter(
          (message) => message.role === "assistant" && message.id !== "welcome",
        )
        .map((message) => message.text.trim())
        .filter(Boolean);
      const lessonText = tutorNotes.join("\n\n");
      const formulas =
        lessonText.match(/\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/g) ?? [];
      await generateLearningPdf(`Fișă de recapitulare · ${pdfSubject}`, [
        { heading: "Materia", body: pdfSubject },
        {
          heading: "Noțiuni teoretice discutate",
          body:
            lessonText ||
            "Trimite o întrebare și cere o explicație de concept pentru a construi fișa acestei lecții.",
        },
        {
          heading: "Formule importante",
          body: formulas.length
            ? formulas.join("\n\n")
            : "În această sesiune nu a fost folosită o formulă.",
        },
        ...exportMessages.filter((message) => message.role === "assistant" && message.diagram).map((message) => ({
          heading: message.diagram!.caption,
          body: message.diagram!.category === "schematic"
            ? message.diagram!.steps.map((step) => `${step.calculation}\n${step.meaning}`).join("\n\n")
            : message.diagram!.category === "reaction"
              ? `Reactanți: ${message.diagram!.reactants.map((item) => `${item.coefficient > 1 ? `${item.coefficient} ` : ""}${item.formula}${item.state ? ` (${item.state})` : ""}`).join(" + ")}\nProduși: ${message.diagram!.products.map((item) => `${item.coefficient > 1 ? `${item.coefficient} ` : ""}${item.formula}${item.state ? ` (${item.state})` : ""}`).join(" + ")}${message.diagram!.conditions ? `\nCondiții: ${message.diagram!.conditions}` : ""}`
            : [
                message.diagram!.schematic ? "Reprezentare schematică, nu este la scară." : "Structură și relații interpretate din enunț.",
                ...message.diagram!.constraints,
              ].join("\n\n"),
          diagramSvg: diagramSvg(message.diagram!),
        })),
        {
          heading: "Următorul pas",
          body: "Încearcă să explici ideea cu propriile cuvinte, apoi rezolvă un exercițiu fără să privești fișa.",
        },
      ]);
      setNotice(Platform.OS === "web" ? "Alege «Salvează ca PDF» în dialogul de tipărire." : ro.pdfReady);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Eroare necunoscută";
      setNotice(`Fișa PDF nu a putut fi pregătită: ${reason}`);
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]} safeAreaClassName="px-5">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.topBar}>
          <ScreenHeader
            eyebrow={ro.tutorEyebrow}
            title={ro.tutor}
            action={<IconButton icon="more-horiz" label="Mai multe opțiuni" />}
          />
        </View>
        <View style={styles.controlRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowSubjectPicker((value) => !value)}
            style={[
              styles.selector,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <MaterialIcons
              name="auto-stories"
              size={17}
              color={colors.primary}
            />
            <Text style={[styles.selectorText, { color: colors.foreground }]}>
              {subject}
            </Text>
            <MaterialIcons name="expand-more" size={18} color={colors.muted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowAgentPicker((value) => !value)}
            style={[
              styles.selector,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View
              style={[styles.agentDot, { backgroundColor: colors.success }]}
            />
            <Text style={[styles.selectorText, { color: colors.foreground }]}>
              {agent}
            </Text>
            <MaterialIcons name="expand-more" size={18} color={colors.muted} />
          </Pressable>
        </View>
        {showSubjectPicker ? (
          <SurfaceCard style={styles.pickerCard}>
            <Text style={[styles.pickerLabel, { color: colors.muted }]}>
              MATERIE
            </Text>
            <View style={styles.pickerWrap}>
              {SUBJECTS.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    setSubject(item.label);
                    setShowSubjectPicker(false);
                  }}
                  style={[
                    styles.pickerItem,
                    {
                      backgroundColor:
                        subject === item.label
                          ? `${item.tint}15`
                          : "transparent",
                    },
                  ]}
                >
                  <MaterialIcons
                    name={item.icon as never}
                    size={16}
                    color={item.tint}
                  />
                  <Text
                    style={[
                      styles.pickerItemText,
                      { color: colors.foreground },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </SurfaceCard>
        ) : null}
        {showAgentPicker ? (
          <SurfaceCard style={styles.pickerCard}>
            <Text style={[styles.pickerLabel, { color: colors.muted }]}>
              STIL DE ÎNVĂȚARE
            </Text>
            <View style={styles.pickerWrap}>
              {[
                "Ghid socratic",
                "Pregătire de examen",
                "Explicație vizuală",
              ].map((item) => (
                <Pressable
                  key={item}
                  onPress={() => {
                    setAgent(item);
                    setShowAgentPicker(false);
                  }}
                  style={[
                    styles.pickerItem,
                    {
                      backgroundColor:
                        agent === item ? `${colors.primary}15` : "transparent",
                    },
                  ]}
                >
                  <MaterialIcons
                    name={
                      item === "Pregătire de examen"
                        ? "timer"
                        : item === "Explicație vizuală"
                          ? "visibility"
                          : "question-mark"
                    }
                    size={16}
                    color={colors.primary}
                  />
                  <Text
                    style={[
                      styles.pickerItemText,
                      { color: colors.foreground },
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              ))}
            </View>
          </SurfaceCard>
        ) : null}
        <ScrollView
          ref={scrollRef}
          style={styles.conversation}
          contentContainerStyle={styles.conversationContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: false })
          }
        >
          <View style={styles.modeStatus}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: notice.startsWith("Ghid live")
                    ? colors.success
                    : colors.warning,
                },
              ]}
            />
            <Text style={[styles.statusText, { color: colors.muted }]}>
              {notice}
            </Text>
          </View>
          {messages.map((message) => (
            <TutorMessageCard key={message.id} message={message} />
          ))}
          {pending ? (
            <View style={styles.typing}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.typingText, { color: colors.muted }]}>
                Construiesc următorul pas…
              </Text>
            </View>
          ) : null}
          <View style={styles.attachedWrap}>
            <UploadCard
              value={upload}
              compact
              onChange={async (value) => {
                setUpload(value);
                if (value && Platform.OS !== "web") {
                  await savePendingUpload(value);
                } else if (!value) {
                  await clearPendingUpload();
                }
              }}
            />
          </View>
        </ScrollView>
        <View style={styles.quickActions}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickActionsContent}
          >
            {TUTOR_MODES.map((action) => (
              <Pressable
                key={action.id}
                accessibilityRole="button"
                onPress={() => handleQuickAction(action.id)}
                style={[
                  styles.quickAction,
                  {
                    borderColor: `${action.tone}45`,
                    backgroundColor: `${action.tone}12`,
                  },
                ]}
              >
                <MaterialIcons
                  name={action.icon as never}
                  size={16}
                  color={action.tone}
                />
                <Text
                  style={[styles.quickActionText, { color: colors.foreground }]}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <View
          style={[
            styles.composer,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Înregistrează o notă vocală"
            onPress={() => setShowVoiceDisclosure((value) => !value)}
            style={styles.paperclip}
          >
            <MaterialIcons
              name="mic-none"
              size={21}
              color={recording ? colors.error : colors.muted}
            />
          </Pressable>
          <TextInput
            accessibilityLabel="Întrebarea pentru Elunariq"
            value={input}
            onChangeText={setInput}
            multiline
            placeholder={ro.askQuestion}
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.foreground }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Trimite întrebarea"
            onPress={() => submitQuestion(input)}
            disabled={(!input.trim() && !upload) || pending}
            style={[
              styles.sendButton,
              {
                backgroundColor:
                  (input.trim() || upload) && !pending ? colors.primary : colors.border,
              },
            ]}
          >
            <MaterialIcons
              name="arrow-upward"
              size={19}
              color={(input.trim() || upload) && !pending ? "#FFFFFF" : colors.muted}
            />
          </Pressable>
        </View>
        {showVoiceDisclosure ? (
          <SurfaceCard style={styles.voiceCard}>
            <Text style={[styles.voiceTitle, { color: colors.foreground }]}>
              Notă vocală și transcriere
            </Text>
            <Text style={[styles.voiceBody, { color: colors.muted }]}>
              După înregistrare, vocea este trimisă serviciului de transcriere configurat pe server. Textul rezultat rămâne în casetă pentru verificare înainte să îl trimiți tutorului.
            </Text>
            <View style={styles.voiceActions}>
              <Pressable
                onPress={toggleVoice}
                style={[
                  styles.smallAction,
                  {
                    backgroundColor: recording ? colors.error : colors.primary,
                  },
                ]}
              >
                <Text style={styles.smallActionText}>
                  {recording ? "Oprește" : "Înregistrează"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowVoiceDisclosure(false)}
                style={[
                  styles.smallAction,
                  { borderColor: colors.border, borderWidth: 1 },
                ]}
              >
                <Text style={[styles.smallActionText, { color: colors.muted }]}>
                  Închide
                </Text>
              </Pressable>
            </View>
          </SurfaceCard>
        ) : null}
        <View style={styles.footerRow}>
          <Badge tone={mode === "direct" ? colors.warning : colors.primary}>
            {mode === "direct" ? ro.directAnswer : ro.guidedMode}
          </Badge>
          <View style={styles.footerActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void exportPdf()}
              disabled={pdfBusy}
            >
              <Text style={[styles.modeToggle, { color: colors.primary }]}>
                {pdfBusy ? "Se pregătește…" : "Descarcă fișa PDF"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setMode((value) => (value === "direct" ? "guided" : "direct"))
              }
            >
              <Text style={[styles.modeToggle, { color: colors.primary }]}>
                {mode === "direct"
                  ? "Revino la ghidare"
                  : "Cere răspunsul complet"}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
const styles = StyleSheet.create({
  topBar: { marginBottom: 3 },
  controlRow: { flexDirection: "row", gap: 9, marginBottom: 10 },
  selector: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  selectorText: { flex: 1, fontSize: 11, fontWeight: "800" },
  agentDot: { width: 8, height: 8, borderRadius: 4 },
  pickerCard: { padding: 13, marginBottom: 10 },
  pickerLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  pickerWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  pickerItemText: { fontSize: 12, fontWeight: "700" },
  conversation: { flex: 1 },
  conversationContent: { paddingTop: 8, paddingBottom: 12 },
  modeStatus: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginBottom: 13,
    paddingHorizontal: 3,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginTop: 5 },
  statusText: { flex: 1, fontSize: 11, lineHeight: 16 },
  typing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 9,
  },
  typingText: { fontSize: 12 },
  attachedWrap: { marginTop: 5 },
  quickActions: { marginTop: 6, marginBottom: 9 },
  quickActionsContent: { gap: 7, paddingVertical: 2 },
  quickAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  quickActionText: { fontSize: 11, fontWeight: "800" },
  composer: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 7,
    gap: 6,
  },
  paperclip: {
    width: 34,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    maxHeight: 94,
    minHeight: 38,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 2,
    paddingVertical: 9,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceCard: { marginTop: 10, padding: 13 },
  voiceTitle: { fontSize: 14, fontWeight: "800", marginBottom: 6 },
  voiceBody: { fontSize: 11, lineHeight: 16 },
  voiceActions: { flexDirection: "row", gap: 8, marginTop: 11 },
  smallAction: { borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 },
  smallActionText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    gap: 8,
  },
  footerActions: { flex: 1, alignItems: "flex-end", gap: 5 },
  modeToggle: { fontSize: 11, fontWeight: "800" },
});
