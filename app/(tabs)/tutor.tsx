import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
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
import { TutorOnboarding } from "@/components/tutor-onboarding";
import { useColors } from "@/hooks/use-colors";
import { useLearnerData } from "@/lib/learner-context";
import { SUBJECTS } from "@/lib/app-data";
import { ro } from "@/lib/i18n";
import { generateLearningPdf } from "@/lib/pdf";
import {
  clearPendingUploads,
  loadPendingUploads,
  savePendingUploads,
  type PendingUpload,
} from "@/lib/storage";
import {
  loadTutorSessionId,
  loadSavedTutorLesson,
  loadTutorMessages,
  saveTutorSessionId,
  saveTutorLesson,
  saveTutorMessages,
} from "@/lib/tutor-storage";
import {
  buildQuickActionQuestion,
  createMessageId,
  googleImagesSearchUrl,
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
  const { recordQuestion, state: learnerState, loading: learnerLoading, updatePreferences } = useLearnerData();
  const params = useLocalSearchParams<{ autoUpload?: string; subject?: string; lessonId?: string }>();
  const [subject, setSubject] = useState(
    () => SUBJECTS.find((item) => item.label === params.subject)?.label ?? SUBJECTS[0].label,
  );
  const [agent, setAgent] = useState("Ghid socratic");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<TutorMessage[]>([INITIAL_MESSAGE]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [sessionId, setSessionId] = useState(() => createMessageId("session"));
  const [lessonSaved, setLessonSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<TutorMode>("guided");
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [notice, setNotice] = useState<string>(ro.slowReply);
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [showVoiceDisclosure, setShowVoiceDisclosure] = useState(false);
  const [recording, setRecording] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [showTutorSetup, setShowTutorSetup] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const assistantMutation = trpc.assistant.chat.useMutation();
  const voiceMutation = trpc.assistant.transcribe.useMutation();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  useEffect(() => {
    if (Platform.OS === "web") {
      void clearPendingUploads();
      return;
    }
    void loadPendingUploads().then(setUploads);
  }, [params.autoUpload]);
  useFocusEffect(useCallback(() => {
    const requestedSubject = SUBJECTS.find((item) => item.label === params.subject);
    if (requestedSubject && requestedSubject.label !== subject) {
      setSubject(requestedSubject.label);
    }
  }, [params.subject, subject]));
  useEffect(() => {
    let active = true;
    void (async () => {
      const savedLesson = params.lessonId
        ? await loadSavedTutorLesson(params.lessonId)
        : null;
      const savedMessages = savedLesson?.messages ?? await loadTutorMessages();
      const activeSessionId =
        savedLesson?.sessionId ??
        savedLesson?.id ??
        (await loadTutorSessionId()) ??
        createMessageId("session");
      if (!savedLesson) await saveTutorSessionId(activeSessionId);
      if (!active) return;
      setSessionId(activeSessionId);
      setLessonSaved(Boolean(savedLesson));
      if (savedLesson) {
        setMessages(savedLesson.messages);
        setSubject(savedLesson.subject);
      } else if (savedMessages.length) {
        setMessages(savedMessages);
      }
      setMessagesLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [params.lessonId]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void fetch(`${getApiBaseUrl()}/api/health`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (active) setNotice("Serverul tutorului este pregătit. Scrie problema sau atașează tema.");
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        console.warn(
          "[Tutor] API warm-up failed",
          error instanceof Error ? error.message : "unknown error",
        );
        setNotice("Serverul poate avea nevoie de timp pentru pornire. Scrie problema sau atașează tema, apoi încearcă din nou.");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);
  useEffect(() => {
    if (messagesLoaded) void saveTutorMessages(messages);
  }, [messages, messagesLoaded]);
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
      imageUrl?: string;
      imageError?: string;
      analysis?: TutorMessage["analysis"];
    },
    requestedMode: TutorMode,
  ): Promise<TutorMessage> {
    const id = createMessageId("assistant");
    const next: TutorMessage = {
      id,
      role: "assistant",
      mode: requestedMode,
      provider: reply.provider,
      model: reply.model,
      ...(reply.diagram ? { diagram: reply.diagram } : {}),
      ...(reply.imageUrl ? { imageUrl: reply.imageUrl } : {}),
      ...(reply.imageError ? { imageError: reply.imageError } : {}),
      ...(reply.analysis ? { analysis: reply.analysis } : {}),
      createdAt: currentTimestamp(),
      text: reply.text,
    };
    setMessages((current) => [...current, next]);
    setNotice(`${ro.liveTutor} · ${reply.model ?? "model AI"}${reply.analysis?.confidence !== undefined && reply.analysis.confidence >= 0.8 && reply.analysis.subject !== "necunoscut" ? ` · Materie detectată: ${reply.analysis.subject}.` : ""}`);
    return next;
  }
  async function submitQuestion(text: string, requestedMode: TutorMode = mode) {
    const question = text.trim();
    if ((!question && !uploads.length) || pending || !messagesLoaded) return;
    const submittedUploads = uploads;
    const questionText = question || `Ajută-mă să înțeleg tema atașată (${uploads.map((file) => file.name).join(", ")}).`;
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
      const attachments = await Promise.all(submittedUploads.map(async (file) => ({
        name: file.name,
        mimeType: (file.mimeType ?? "text/plain") as "image/png" | "image/jpeg" | "application/pdf" | "text/plain",
        base64: await readBase64(file.uri),
      })));
      if (attachments.reduce((total, file) => total + file.base64.length, 0) > 40_000_000) {
        throw new Error("Atașamentele depășesc 30 MB în total. Trimite mai puține poze sau fișiere odată.");
      }
      const live = await assistantMutation.mutateAsync({
        subject,
        mode: requestedMode,
        question: questionText,
        learnerLevel: learnerState.preferences?.level,
        schoolGrade: learnerState.preferences?.schoolGrade,
        explanationStyle: learnerState.preferences?.explanationStyle,
        studiedTopics: learnerState.preferences?.studiedTopicsSubject === subject
          ? learnerState.preferences.studiedTopics
          : [],
        diagnosticScore: learnerState.preferences?.diagnosticSubject === subject
          ? learnerState.preferences.diagnosticScore
          : undefined,
        visualMode: agent === "Explicație vizuală" || learnerState.preferences?.explanationStyle === "Detaliat și vizual",
        messages: history.slice(-12),
        ...(attachments.length ? { attachments } : {}),
      });
      if (submittedUploads.length) {
        setUploads([]);
        await clearPendingUploads();
      }
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
        text: live.text,
        mode: requestedMode,
        provider: live.provider,
        model: live.model,
        ...(live.diagram ? { diagram: live.diagram } : {}),
        ...(live.imageUrl ? { imageUrl: live.imageUrl } : {}),
        ...(live.imageError ? { imageError: live.imageError } : {}),
        analysis: live.analysis,
        createdAt: currentTimestamp(),
      };
      const assistantMessage = await addReply(live, requestedMode);
      if (lessonSaved) {
        try {
          await saveTutorLesson(sessionId, effectiveSubject, [
            ...messages,
            userMessage,
            assistantMessage,
          ]);
        } catch (error) {
          console.error(
            "[Tutor] Saved lesson update failed",
            error instanceof Error ? error.message : "unknown error",
          );
          setNotice("Răspunsul a fost primit, dar lecția salvată nu a putut fi actualizată.");
        }
      }
      if (requestedMode === "check" && live.analysis?.mastery === "demonstrated") {
        if (Platform.OS === "web") {
          setNotice("Pasul este corect. Poți genera fișa PDF folosind butonul «Descarcă fișa PDF».");
        } else {
          await exportPdf([userMessage, pdfReply], effectiveSubject);
        }
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
    if (pending) return;
    setMode(action);
    const question = buildQuickActionQuestion(action, input, uploads.length > 0);
    if (!question) {
      setNotice("Scrie pasul în casetă sau atașează o fotografie a exercițiului, apoi apasă din nou «Verifică pasul meu».");
      return;
    }
    submitQuestion(question, action);
  }
  function searchGoogleImages() {
    const latestQuestion = [...messages]
      .reverse()
      .find((message) => message.role === "user")?.text;
    if (!latestQuestion) {
      setNotice("Trimite mai întâi exercițiul, apoi poți căuta o imagine legată de el.");
      return;
    }
    const grade = learnerState.preferences.schoolGrade;
    const query = [
      subject,
      grade !== "Nu o precizez" ? grade : "",
      latestQuestion,
    ].filter(Boolean).join(" ");
    const url = googleImagesSearchUrl(query);
    const disclosure = "Materia, clasa (dacă ai ales-o) și textul ultimului exercițiu vor fi trimise către Google pentru căutarea imaginilor. Rezultatele se deschid separat și pot necesita verificarea corectitudinii.";
    const openSearch = () => {
      void Linking.openURL(url)
        .then(() => setNotice("Am deschis rezultatele Google Imagini. Verifică dacă desenul se potrivește lecției tale."))
        .catch((error: unknown) => {
          setNotice(error instanceof Error ? `Căutarea nu s-a putut deschide: ${error.message}` : "Căutarea nu s-a putut deschide.");
        });
    };
    if (Platform.OS === "web") {
      if (window.confirm(disclosure)) openSearch();
      return;
    }
    Alert.alert("Cauți desene pe Google?", disclosure, [
      { text: "Anulează", style: "cancel" },
      { text: "Continuă", onPress: openSearch },
    ]);
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
  async function saveCurrentLesson() {
    try {
      const lesson = await saveTutorLesson(sessionId, subject, messages);
      setLessonSaved(true);
      setNotice(`Lecția „${lesson.title}” a fost salvată pe acest dispozitiv.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Lecția nu a putut fi salvată.");
    }
  }
  async function exportPdf(additionalMessages: TutorMessage[] = [], pdfSubject = subject) {
    if (pdfBusy) return;
    const printWindow = Platform.OS === "web" ? window.open("", "_blank") : undefined;
    if (Platform.OS === "web" && !printWindow) {
      setNotice("Browserul a blocat fereastra pentru PDF. Permite ferestrele pop-up și încearcă din nou.");
      return;
    }
    setPdfBusy(true);
    try {
      const exportMessages = [...messages, ...additionalMessages];
      const lessonMessages = exportMessages.filter(
        (message) => message.id !== "welcome" && message.text.trim(),
      );
      if (!lessonMessages.some((message) => message.role === "assistant")) {
        printWindow?.close();
        setNotice("Trimite mai întâi o întrebare pentru a crea fișa de recapitulare.");
        return;
      }
      const studyGuide = await assistantMutation.mutateAsync({
        subject: pdfSubject,
        mode: "summary",
        question: "Creează o fișă de recapitulare clară, utilă pentru învățare și aliniată programei școlare din România. Sintetizează noțiunile importante discutate, explică termenii necesari, include formulele și pașii de rezolvare relevanți și încheie cu trei întrebări scurte de verificare. Nu reda conversația și nu inventa noțiuni care nu au fost discutate sau nu sunt necesare.",
        learnerLevel: learnerState.preferences?.level,
        schoolGrade: learnerState.preferences?.schoolGrade,
        explanationStyle: learnerState.preferences?.explanationStyle,
        studiedTopics: learnerState.preferences?.studiedTopicsSubject === pdfSubject
          ? learnerState.preferences.studiedTopics
          : [],
        diagnosticScore: learnerState.preferences?.diagnosticSubject === pdfSubject
          ? learnerState.preferences.diagnosticScore
          : undefined,
        visualMode: agent === "Explicație vizuală" || learnerState.preferences?.explanationStyle === "Detaliat și vizual",
        messages: lessonMessages.slice(-10).map((message) => ({
          role: message.role,
          text: message.text.slice(0, message.role === "user" ? 4000 : 8000),
        })),
      });
      const formulas =
        studyGuide.text.match(/\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g) ?? [];
      await generateLearningPdf(`Fișă de recapitulare · ${pdfSubject}`, [
        { heading: "Materia", body: pdfSubject },
        {
          heading: "Sinteză pentru recapitulare",
          body: studyGuide.text,
        },
        {
          heading: "Formule importante",
          body: formulas.length
            ? formulas.join("\n\n")
            : "În această sesiune nu a fost folosită o formulă.",
        },
        ...exportMessages.filter((message) => message.role === "assistant" && message.diagram).slice(-3).map((message) => ({
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
        ...exportMessages.filter((message) => message.role === "assistant" && message.imageUrl).slice(-1).map((message) => ({
          heading: "Imagine educațională",
          body: "Imagine generată pentru tema discutată.",
          imageUrl: /^https?:\/\//i.test(message.imageUrl!)
            ? message.imageUrl!
            : `${getApiBaseUrl()}${message.imageUrl!}`,
        })),
        ...(studyGuide.diagram ? [{
          heading: studyGuide.diagram.caption,
          body: studyGuide.diagram.category === "schematic"
            ? studyGuide.diagram.steps.map((step) => `${step.calculation}\n${step.meaning}`).join("\n\n")
            : studyGuide.diagram.category === "reaction"
              ? `Reactanți: ${studyGuide.diagram.reactants.map((item) => `${item.coefficient > 1 ? `${item.coefficient} ` : ""}${item.formula}${item.state ? ` (${item.state})` : ""}`).join(" + ")}\nProduși: ${studyGuide.diagram.products.map((item) => `${item.coefficient > 1 ? `${item.coefficient} ` : ""}${item.formula}${item.state ? ` (${item.state})` : ""}`).join(" + ")}${studyGuide.diagram.conditions ? `\nCondiții: ${studyGuide.diagram.conditions}` : ""}`
              : [
                  studyGuide.diagram.schematic ? "Reprezentare schematică, nu este la scară." : "Structură și relații interpretate din enunț.",
                  ...studyGuide.diagram.constraints,
                ].join("\n\n"),
          diagramSvg: diagramSvg(studyGuide.diagram),
        }] : []),
        {
          heading: "Următorul pas",
          body: "Răspunde la întrebările de verificare din sinteză, apoi încearcă un exercițiu fără să privești fișa.",
        },
      ], printWindow ?? undefined);
      setNotice(Platform.OS === "web" ? "Alege «Salvează ca PDF» în dialogul de tipărire." : ro.pdfReady);
    } catch (error) {
      printWindow?.close();
      const reason = error instanceof Error ? error.message : "Eroare necunoscută";
      setNotice(`Fișa PDF nu a putut fi pregătită: ${reason}`);
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]} safeAreaClassName="px-4">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.topBar}>
          <ScreenHeader
            eyebrow={ro.tutorEyebrow}
            title={ro.tutor}
            compact
            action={<IconButton icon="tune" label="Configurează nivelul și programa" onPress={() => setShowTutorSetup(true)} size={36} />}
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
          keyboardShouldPersistTaps="handled"
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
                disabled={pending}
                accessibilityState={{ disabled: pending }}
                style={[
                  styles.quickAction,
                  {
                    borderColor: `${action.tone}45`,
                    backgroundColor: `${action.tone}12`,
                    opacity: pending ? 0.5 : 1,
                  },
                ]}
              >
                <MaterialIcons
                  name={action.icon as never}
                  size={14}
                  color={action.tone}
                />
                <Text
                  style={[styles.quickActionText, { color: colors.foreground }]}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Caută desene educaționale pe Google"
              onPress={searchGoogleImages}
              style={[
                styles.quickAction,
                { borderColor: `${colors.primary}45`, backgroundColor: `${colors.primary}12` },
              ]}
            >
              <MaterialIcons name="image-search" size={14} color={colors.primary} />
              <Text style={[styles.quickActionText, { color: colors.foreground }]}>
                Caută desene
              </Text>
            </Pressable>
          </ScrollView>
        </View>
        <View style={styles.attachedWrap}>
          <UploadCard
            value={null}
            multiple
            selectedUploads={uploads}
            compact
            onChange={() => undefined}
            onUploadsChange={async (value) => {
              setUploads(value);
              await savePendingUploads(value);
            }}
          />
        </View>
        <Text style={[styles.exampleHint, { color: colors.muted }]}>
          Poți scrie pasul sau atașa exercițiul. De exemplu: „Am ajuns la 2x = 8. E corect dacă împart ambele părți la 2?”
        </Text>
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
            placeholder="Scrie enunțul, pasul tău sau întrebarea…"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.foreground }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Trimite întrebarea"
            onPress={() => submitQuestion(input)}
            disabled={(!input.trim() && !uploads.length) || pending}
            style={[
              styles.sendButton,
              {
                backgroundColor:
                  (input.trim() || uploads.length) && !pending ? colors.primary : colors.border,
              },
            ]}
          >
            <MaterialIcons
              name="arrow-upward"
              size={19}
              color={(input.trim() || uploads.length) && !pending ? "#FFFFFF" : colors.muted}
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
              onPress={() => void saveCurrentLesson()}
              disabled={pending}
            >
              <Text style={[styles.modeToggle, { color: colors.primary }]}>
                Salvează lecția
              </Text>
            </Pressable>
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
      {showTutorSetup || (!learnerLoading && !learnerState.preferences.tutorSetupComplete) ? (
        <TutorOnboarding
          canDismiss={learnerState.preferences.tutorSetupComplete}
          subject={subject}
          schoolGrade={learnerState.preferences.schoolGrade}
          level={learnerState.preferences.level}
          studiedTopics={
            learnerState.preferences.studiedTopicsSubject === subject
              ? learnerState.preferences.studiedTopics
              : []
          }
          onClose={() => setShowTutorSetup(false)}
          onComplete={(setup) => {
            setSubject(setup.subject);
            updatePreferences({
              schoolGrade: setup.schoolGrade,
              level: setup.level,
              studiedTopics: setup.studiedTopics,
              studiedTopicsSubject: setup.subject,
              diagnosticScore: setup.diagnosticScore,
              diagnosticSubject: setup.subject,
              tutorSetupComplete: true,
            });
            setShowTutorSetup(false);
            setNotice("Nivelul și temele studiate au fost salvate. Explicațiile vor porni de aici.");
          }}
        />
      ) : null}
    </ScreenContainer>
  );
}
const styles = StyleSheet.create({
  topBar: { marginBottom: 0 },
  controlRow: { flexDirection: "row", gap: 7, marginBottom: 6 },
  selector: {
    flex: 1,
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  selectorText: { flex: 1, fontSize: 11, fontWeight: "800" },
  agentDot: { width: 8, height: 8, borderRadius: 4 },
  pickerCard: { padding: 10, marginBottom: 7 },
  pickerLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  pickerWrap: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
  },
  pickerItemText: { fontSize: 12, fontWeight: "700" },
  conversation: { flex: 1 },
  conversationContent: { paddingTop: 4, paddingBottom: 6 },
  modeStatus: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginBottom: 7,
    paddingHorizontal: 2,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginTop: 5 },
  statusText: { flex: 1, fontSize: 11, lineHeight: 16 },
  typing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 6,
  },
  typingText: { fontSize: 12 },
  attachedWrap: { marginBottom: 3 },
  exampleHint: { fontSize: 10, lineHeight: 14, marginBottom: 4, paddingHorizontal: 2 },
  quickActions: { marginTop: 2, marginBottom: 4 },
  quickActionsContent: { gap: 5, paddingVertical: 1 },
  quickAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  quickActionText: { fontSize: 10, fontWeight: "800" },
  composer: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 5,
    gap: 4,
  },
  paperclip: {
    width: 30,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    maxHeight: 86,
    minHeight: 34,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 2,
    paddingVertical: 7,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 11,
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
    paddingVertical: 3,
    gap: 6,
  },
  footerActions: { flex: 1, alignItems: "flex-end", gap: 5 },
  modeToggle: { fontSize: 10, fontWeight: "800" },
});
