import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
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
  type PendingUpload,
} from "@/lib/storage";
import {
  createMessageId,
  getDemoReply,
  revealSlowly,
  TUTOR_MODES,
  type TutorMessage,
  type TutorMode,
} from "@/services/ai-service";
import { trpc } from "@/lib/trpc";

const INITIAL_MESSAGE: TutorMessage = {
  id: "welcome",
  role: "assistant",
  mode: "guided",
  provider: "demo",
  createdAt: Date.now(),
  text: "## Începem cu primul pas\n\nScrie enunțul exact sau spune-mi ce ai încercat. Nu îți dau rezultatul din prima. Vreau să înțeleg cum gândești și să îți pun întrebarea potrivită.",
};

function currentTimestamp(): number {
  return Date.now();
}

export default function TutorScreen() {
  const colors = useColors();
  const { recordTutorQuestion } = useLearnerData();
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
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  useEffect(() => {
    loadPendingUpload().then(setUpload);
  }, [params.autoUpload]);
  const history = useMemo(
    () => messages.map(({ role, text }) => ({ role, text })),
    [messages],
  );

  async function addReply(
    reply: {
      text: string;
      provider: "live" | "demo";
      model?: string;
      notice?: string;
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
      createdAt: currentTimestamp(),
    };
    setMessages((current) => [...current, next]);
    setNotice(
      reply.notice ??
        (reply.provider === "live"
          ? `${ro.liveTutor} · răspunsul este afișat treptat.`
          : ro.demoMode),
    );
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
    if (!question || pending) return;
    setInput("");
    setPending(true);
    const userMessage: TutorMessage = {
      id: createMessageId("user"),
      role: "user",
      text: question,
      mode: requestedMode,
      createdAt: currentTimestamp(),
    };
    setMessages((current) => [...current, userMessage]);
    recordTutorQuestion(subject);
    try {
      const live = await assistantMutation.mutateAsync({
        subject,
        mode: requestedMode,
        question,
        messages: history.slice(-12),
      });
      await addReply(live, requestedMode);
    } catch {
      const demo = await getDemoReply({
        subject,
        mode: requestedMode,
        question,
        history,
      });
      await addReply(demo, requestedMode);
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
        setNotice(
          recorderState.url
            ? "Nota vocală este pregătită. Transcrierea va fi trimisă doar după activarea serviciului de transcriere."
            : "Nota vocală nu a fost salvată.",
        );
      }
    } catch {
      setRecording(false);
      setNotice(
        "Înregistrarea vocală nu este disponibilă pe acest dispozitiv.",
      );
    }
  }
  async function exportPdf() {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const tutorNotes = messages
        .filter(
          (message) => message.role === "assistant" && message.id !== "welcome",
        )
        .map((message) => message.text.trim())
        .filter(Boolean);
      const lessonText = tutorNotes.join("\n\n");
      const formulas =
        lessonText.match(/\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/g) ?? [];
      await generateLearningPdf(`Fișă de recapitulare · ${subject}`, [
        { heading: "Materia", body: subject },
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
        {
          heading: "Următorul pas",
          body: "Încearcă să explici ideea cu propriile cuvinte, apoi rezolvă un exercițiu fără să privești fișa.",
        },
      ]);
      setNotice(ro.pdfReady);
    } catch {
      setNotice(
        "Fișa PDF nu a putut fi pregătită sau partajată. Încearcă din nou după ce verifici conexiunea și opțiunile dispozitivului.",
      );
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
        <SurfaceCard style={styles.diagramCard}>
          <Text style={[styles.diagramLabel, { color: colors.muted }]}>
            MODEL DE GÂNDIRE
          </Text>
          <View style={styles.diagramRow}>
            <Text style={[styles.diagramFormula, { color: colors.foreground }]}>
              a + b = c
            </Text>
            <MaterialIcons
              name="arrow-forward"
              size={17}
              color={colors.primary}
            />
            <Text style={[styles.diagramFormula, { color: colors.primary }]}>
              a = c − b
            </Text>
          </View>
          <Text style={[styles.diagramHint, { color: colors.muted }]}>
            Aplică aceeași operație pe ambele părți.
          </Text>
        </SurfaceCard>
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
          {upload ? (
            <View style={styles.attachedWrap}>
              <UploadCard
                value={upload}
                onChange={async (value) => {
                  setUpload(value);
                  if (!value) await clearPendingUpload();
                }}
              />
            </View>
          ) : null}
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
            disabled={!input.trim() || pending}
            style={[
              styles.sendButton,
              {
                backgroundColor:
                  input.trim() && !pending ? colors.primary : colors.border,
              },
            ]}
          >
            <MaterialIcons
              name="arrow-upward"
              size={19}
              color={input.trim() && !pending ? "#FFFFFF" : colors.muted}
            />
          </Pressable>
        </View>
        {showVoiceDisclosure ? (
          <SurfaceCard style={styles.voiceCard}>
            <Text style={[styles.voiceTitle, { color: colors.foreground }]}>
              Notă vocală și transcriere
            </Text>
            <Text style={[styles.voiceBody, { color: colors.muted }]}>
              Elunariq cere permisiunea microfonului înainte de înregistrare.
              Fișierul nu este trimis și nu este pretins ca transcris până când
              serviciul de transcriere este activat.
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
              onPress={exportPdf}
              disabled={pdfBusy}
            >
              <Text style={[styles.modeToggle, { color: colors.primary }]}>
                {pdfBusy ? "Se pregătește…" : "Fișă de teorie PDF"}
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
  diagramCard: { padding: 12, marginBottom: 10 },
  diagramLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  diagramRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  diagramFormula: { fontFamily: "monospace", fontSize: 15, fontWeight: "800" },
  diagramHint: { fontSize: 10, marginTop: 7 },
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
