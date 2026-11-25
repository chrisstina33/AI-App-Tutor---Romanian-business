import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
import { compressImageForUpload } from "@/lib/image-compression";
import { generateLearningPdf } from "@/lib/pdf";
import {
  clearPendingUploads,
  loadPendingUploads,
  savePendingUploads,
  type PendingUpload,
} from "@/lib/storage";
import {
  loadTutorSessionId,
  loadTutorChats,
  loadSavedTutorLesson,
  loadTutorMessages,
  deleteTutorChat,
  renameTutorChat,
  saveTutorSessionId,
  saveTutorChat,
  saveTutorLesson,
  saveTutorMessages,
  type TutorChat,
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
import { normalizeTutorResponseText } from "@/shared/tutor-text";

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
  const params = useLocalSearchParams<{ autoUpload?: string; subject?: string; lessonId?: string; setup?: string }>();
  const [subject, setSubject] = useState(
    () => SUBJECTS.find((item) => item.label === params.subject)?.label
      ?? SUBJECTS.find((item) => item.label === learnerState.preferences.diagnosticSubject)?.label
      ?? SUBJECTS.find((item) => item.id === learnerState.preferences.preferredSubjects[0])?.label
      ?? SUBJECTS[0].label,
  );
  const [chatTitle, setChatTitle] = useState("Chat nou");
  const [chats, setChats] = useState<TutorChat[]>([]);
  const [showChats, setShowChats] = useState(false);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [agent, setAgent] = useState("Ghid socratic");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<TutorMessage[]>([INITIAL_MESSAGE]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [sessionId, setSessionId] = useState(() => createMessageId("session"));
  const [lessonSaved, setLessonSaved] = useState(false);
  const [savingLesson, setSavingLesson] = useState(false);
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
  const chatStartedRef = useRef(false);
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
    if (requestedSubject) setSubject(requestedSubject.label);
  }, [params.subject]));
  useEffect(() => {
    let active = true;
    void (async () => {
      const savedLesson = params.lessonId
        ? await loadSavedTutorLesson(params.lessonId)
        : null;
      const defaultSubject = SUBJECTS.find(
        (item) => item.label === learnerState.preferences.diagnosticSubject,
      )?.label ?? SUBJECTS.find(
        (item) => item.id === learnerState.preferences.preferredSubjects[0],
      )?.label ?? SUBJECTS[0].label;
      const savedChats = await loadTutorChats(defaultSubject);
      const rememberedId = await loadTutorSessionId();
      const activeChat = savedChats.find((chat) => chat.id === rememberedId)
        ?? savedChats[0];
      const savedMessages = savedLesson?.messages
        ?? activeChat?.messages
        ?? await loadTutorMessages();
      const activeSessionId = savedLesson?.sessionId
        ?? savedLesson?.id
        ?? activeChat?.id
        ?? rememberedId
        ?? createMessageId("session");
      if (!savedLesson) await saveTutorSessionId(activeSessionId);
      if (!active) return;
      setSessionId(activeSessionId);
      setChats(savedChats);
      setChatTitle(savedLesson?.title ?? activeChat?.title ?? "Chat nou");
      setLessonSaved(Boolean(savedLesson));
      if (savedLesson) {
        setMessages(savedLesson.messages);
        setSubject(savedLesson.subject);
      } else if (savedMessages.length) {
        setMessages(savedMessages);
      }
      if (savedLesson) {
        const chat = {
          id: activeSessionId,
          title: savedLesson.title,
          subject: savedLesson.subject,
          updatedAt: new Date().toISOString(),
          messages: savedLesson.messages,
        };
        void saveTutorChat(chat).then(setChats).catch((error: unknown) => {
          setNotice(error instanceof Error ? `Lecția nu a putut fi adăugată la chaturi: ${error.message}` : "Lecția nu a putut fi adăugată la chaturi.");
        });
      } else if (activeChat) {
        setSubject(activeChat.subject);
      } else {
        setSubject(defaultSubject);
      }
      setMessagesLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [
    learnerState.preferences.diagnosticSubject,
    learnerState.preferences.preferredSubjects,
    params.lessonId,
  ]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void fetch(`${getApiBaseUrl()}/api/health`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (active && !chatStartedRef.current) {
          setNotice("Serverul tutorului este pregătit. Scrie problema sau atașează tema.");
        }
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        console.warn(
          "[Tutor] API warm-up failed",
          error instanceof Error ? error.message : "unknown error",
        );
        if (!chatStartedRef.current) {
          setNotice("Serverul poate avea nevoie de timp pentru pornire. Scrie problema sau atașează tema, apoi încearcă din nou.");
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);
  useEffect(() => {
    if (!messagesLoaded) return;
    void saveTutorMessages(messages);
    void saveTutorChat({
      id: sessionId,
      title: chatTitle,
      subject,
      updatedAt: new Date().toISOString(),
      messages,
    }).then(setChats).catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : "Eroare necunoscută";
      setNotice(`Conversația nu a putut fi salvată pe acest dispozitiv: ${detail}`);
    });
  }, [chatTitle, messages, messagesLoaded, sessionId, subject]);
  const history = useMemo(
    () => messages.map(({ role, text }) => ({ role, text })),
    [messages],
  );

  async function addReply(
    reply: {
      title: string;
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
      title: reply.title,
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
    chatStartedRef.current = true;
    setInput("");
    setPending(true);
    setNotice(ro.aiRequestPending);
    const userMessage: TutorMessage = {
      id: createMessageId("user"),
      role: "user",
      text: questionText,
      mode: requestedMode,
      createdAt: currentTimestamp(),
    };
    setMessages((current) => [...current, userMessage]);
    let recordedQuestion = false;
    let requestSent = false;
    let responseReceived = false;
    try {
      const attachments = await Promise.all(submittedUploads.map(async (file) => {
        const mimeType = (file.mimeType ?? "text/plain") as "image/png" | "image/jpeg" | "application/pdf" | "text/plain";
        const contents = Platform.OS === "web" && mimeType.startsWith("image/")
          ? await compressImageForUpload(file.uri)
          : { base64: await readBase64(file.uri), mimeType };
        return { name: file.name, ...contents };
      }));
      if (attachments.reduce((total, file) => total + file.base64.length, 0) > 40_000_000) {
        throw new Error("Atașamentele depășesc 30 MB în total. Trimite mai puține poze sau fișiere odată.");
      }
      requestSent = true;
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
      responseReceived = true;
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
      const alreadyTitled = messages.some(
        (message) => message.role === "assistant" && message.title,
      );
      const lessonTitle = alreadyTitled ? chatTitle : live.title;
      if (!alreadyTitled) setChatTitle(live.title);
      if (lessonSaved) {
        try {
          await saveTutorLesson(sessionId, effectiveSubject, [
            ...messages,
            userMessage,
            assistantMessage,
          ], lessonTitle);
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
      if (!responseReceived) {
        setMessages((current) => current.filter((message) => message.id !== userMessage.id));
        setInput(question);
        setNotice(
          requestSent
            ? ro.aiRequestFailed
            : detail.startsWith("Atașamentele depășesc")
              ? detail
              : "Fotografia sau fișierul nu a putut fi pregătit. Alege alt fișier și încearcă din nou.",
        );
      } else {
        setNotice("Răspunsul a fost primit, dar nu a putut fi finalizat. Îl poți găsi în conversație.");
      }
    } finally {
      setPending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }
  function handleQuickAction(action: TutorMode) {
    if (pending) return;
    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user")?.text ?? "";
    const draft = action === "direct" && !input.trim()
      ? latestUserMessage
      : input;
    if (action === "direct" && !draft.trim() && !uploads.length) {
      setMode(action);
      setNotice("Scrie enunțul problemei sau atașează tema, apoi cere răspunsul complet.");
      return;
    }
    setMode(action);
    const question = buildQuickActionQuestion(action, draft, uploads.length > 0);
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
    if (savingLesson) return;
    setSavingLesson(true);
    try {
      const lesson = await saveTutorLesson(
        sessionId,
        subject,
        messages,
        chatTitle === "Chat nou" ? undefined : chatTitle,
      );
      setLessonSaved(true);
      setNotice(`Lecția „${lesson.title}” a fost salvată pe acest dispozitiv. Apare în Panou și Progres.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Lecția nu a putut fi salvată.");
    } finally {
      setSavingLesson(false);
    }
  }
  async function startNewChat() {
    if (pending) return;
    try {
      await saveTutorChat({
        id: sessionId,
        title: chatTitle,
        subject,
        updatedAt: new Date().toISOString(),
        messages,
      });
      const nextId = createMessageId("session");
      const nextChat: TutorChat = {
        id: nextId,
        title: "Chat nou",
        subject: SUBJECTS.find((item) => item.label === learnerState.preferences.diagnosticSubject)?.label
          ?? SUBJECTS.find((item) => item.id === learnerState.preferences.preferredSubjects[0])?.label
          ?? SUBJECTS[0].label,
        updatedAt: new Date().toISOString(),
        messages: [INITIAL_MESSAGE],
      };
      setChats(await saveTutorChat(nextChat));
      setSessionId(nextId);
      setChatTitle(nextChat.title);
      setSubject(nextChat.subject);
      setMessages([INITIAL_MESSAGE]);
      setLessonSaved(false);
      setMessagesLoaded(true);
      await saveTutorSessionId(nextId);
      setShowChats(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Chatul nou nu a putut fi creat.");
    }
  }
  async function openChat(chat: TutorChat) {
    if (pending) return;
    setSessionId(chat.id);
    setChatTitle(chat.title);
    setSubject(chat.subject);
    setMessages(chat.messages);
    setLessonSaved(false);
    setMessagesLoaded(true);
    setShowChats(false);
    try {
      await saveTutorSessionId(chat.id);
    } catch (error) {
      setNotice(error instanceof Error ? `Sesiunea nu a putut fi actualizată pe acest dispozitiv: ${error.message}` : "Sesiunea nu a putut fi actualizată pe acest dispozitiv.");
    }
  }
  async function commitRename() {
    if (!renamingChatId) return;
    try {
      const updated = await renameTutorChat(renamingChatId, renameValue);
      setChats(updated);
      if (sessionId === renamingChatId) setChatTitle(renameValue.trim().slice(0, 200));
      setRenamingChatId(null);
      setRenameValue("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Conversația nu a putut fi redenumită.");
    }
  }
  function confirmDeleteChat(chat: TutorChat) {
    if (pending) return;
    const remove = async () => {
      try {
        const updated = await deleteTutorChat(chat.id);
        setChats(updated);
        if (sessionId === chat.id) {
          const replacement = updated[0];
          if (replacement) await openChat(replacement);
          else {
            const nextId = createMessageId("session");
            const nextSubject = SUBJECTS.find((item) => item.label === learnerState.preferences.diagnosticSubject)?.label
              ?? SUBJECTS.find((item) => item.id === learnerState.preferences.preferredSubjects[0])?.label
              ?? SUBJECTS[0].label;
            setSessionId(nextId);
            setChatTitle("Chat nou");
            setSubject(nextSubject);
            setMessages([INITIAL_MESSAGE]);
            setLessonSaved(false);
            await saveTutorSessionId(nextId);
            setShowChats(false);
          }
        }
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Conversația nu a putut fi ștearsă.");
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm(`Ștergi conversația „${chat.title}”?`)) void remove();
    } else {
      Alert.alert("Ștergi conversația?", `„${chat.title}” va fi eliminată de pe acest dispozitiv.`, [
        { text: "Anulează", style: "cancel" },
        { text: "Șterge", style: "destructive", onPress: () => void remove() },
      ]);
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
      const transcriptText = lessonMessages
        .slice(-40)
        .map((message) =>
          `${message.role === "user" ? "Elev" : "Elunariq"}: ${normalizeTutorResponseText(message.text)}`,
        )
        .join("\n\n");
      const formulas =
        transcriptText.match(/\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g) ?? [];
      await generateLearningPdf(
        `${chatTitle === "Chat nou" ? `Lecție de ${pdfSubject}` : chatTitle} · Elunariq`,
        [
          { heading: "Materia", body: pdfSubject },
          {
            heading: "Conversație",
            body: transcriptText,
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
          {
            heading: "Următorul pas",
            body: "Reia explicațiile și încearcă să rezolvi un exercițiu asemănător fără ajutor.",
          },
        ],
        printWindow ?? undefined,
      );
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
            action={
              <View style={styles.headerActions}>
                <Pressable accessibilityRole="button" onPress={() => setShowChats(true)} style={[styles.chatsButton, { borderColor: colors.border }]}>
                  <MaterialIcons name="forum" size={15} color={colors.primary} />
                  <Text style={[styles.chatsButtonText, { color: colors.foreground }]}>Chaturi</Text>
                </Pressable>
                <IconButton icon="tune" label="Configurează nivelul și programa" onPress={() => setShowTutorSetup(true)} size={36} />
              </View>
            }
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
                AI-ul pregătește răspunsul…
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
        {uploads.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.attachmentList}
            contentContainerStyle={styles.attachmentItems}
          >
            {uploads.map((file, index) => (
              <Pressable
                key={`${file.uri}-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`Elimină atașamentul ${file.name}`}
                onPress={async () => {
                  const nextUploads = uploads.filter((_, fileIndex) => fileIndex !== index);
                  setUploads(nextUploads);
                  await savePendingUploads(nextUploads);
                }}
                style={[styles.attachmentChip, { backgroundColor: `${colors.primary}12` }]}
              >
                <Text numberOfLines={1} style={[styles.attachmentName, { color: colors.foreground }]}>{file.name}</Text>
                <MaterialIcons name="close" size={14} color={colors.muted} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <Text style={[styles.exampleHint, { color: colors.muted }]}>
          Poți scrie pasul sau atașa exercițiul. De exemplu: „Am ajuns la 2x = 8. E corect dacă împart ambele părți la 2?”
        </Text>
        <View
          style={[
            styles.composer,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <UploadCard
            value={null}
            multiple
            selectedUploads={uploads}
            inline
            onChange={() => undefined}
            onUploadsChange={async (value) => {
              setUploads(value);
              await savePendingUploads(value);
            }}
          />
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
              accessibilityLabel={lessonSaved ? "Lecție salvată pe acest dispozitiv" : "Salvează lecția pe acest dispozitiv"}
              onPress={() => void saveCurrentLesson()}
              disabled={pending || savingLesson}
              style={[styles.footerAction, { borderColor: colors.border }]}
            >
              <Text style={[styles.modeToggle, { color: colors.primary }]}>
                {savingLesson ? "Se salvează…" : lessonSaved ? "Salvat local" : "Salvează lecția"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void exportPdf()}
              disabled={pdfBusy}
              style={[styles.footerAction, { borderColor: colors.border }]}
            >
              <Text style={[styles.modeToggle, { color: colors.primary }]}>
                {pdfBusy ? "Se pregătește…" : "Descarcă fișa PDF"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => mode === "direct" ? setMode("guided") : handleQuickAction("direct")}
              style={[styles.footerAction, { borderColor: colors.border }]}
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
      {showTutorSetup || params.setup === "1" || (!learnerLoading && !learnerState.preferences.tutorSetupComplete) ? (
        <TutorOnboarding
          canDismiss={learnerState.preferences.tutorSetupComplete}
          subject={subject}
          prioritySubjects={[
            learnerState.preferences.diagnosticSubject,
            ...learnerState.preferences.preferredSubjects.map(
              (id) => SUBJECTS.find((item) => item.id === id)?.label ?? "",
            ),
          ].filter((value, index, list) => Boolean(value) && list.indexOf(value) === index)}
          schoolGrade={learnerState.preferences.schoolGrade}
          level={learnerState.preferences.level}
          studiedTopics={
            learnerState.preferences.studiedTopicsSubject === subject
              ? learnerState.preferences.studiedTopics
              : []
          }
          onClose={() => {
            setShowTutorSetup(false);
            router.setParams({ setup: undefined });
          }}
          onComplete={(setup) => {
            setSubject(setup.subject);
            updatePreferences({
              schoolGrade: setup.schoolGrade,
              level: setup.level,
              studiedTopics: setup.studiedTopics,
              studiedTopicsSubject: setup.subject,
              diagnosticScore: setup.diagnosticScore,
              diagnosticSubject: setup.subject,
              diagnosticAnswers: setup.diagnosticAnswers,
              preferredSubjects: setup.subjects
                .map((label) => SUBJECTS.find((item) => item.label === label)?.id)
                .filter((id): id is string => Boolean(id)),
              tutorSetupComplete: true,
            });
            setShowTutorSetup(false);
            router.setParams({ setup: undefined });
            setNotice("Nivelul și temele studiate au fost salvate. Explicațiile vor porni de aici.");
          }}
        />
      ) : null}
      <Modal visible={showChats} transparent animationType="fade" onRequestClose={() => setShowChats(false)}>
        <View style={styles.sheetBackdrop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Închide lista chaturilor" onPress={() => setShowChats(false)} style={StyleSheet.absoluteFill} />
          <View style={[styles.chatSheet, { backgroundColor: colors.background }]}>
            <View style={styles.chatSheetHeader}>
              <View style={styles.chatSheetTitleWrap}>
                <Text style={[styles.chatSheetTitle, { color: colors.foreground }]}>Chaturi</Text>
                <Text style={[styles.chatSheetHint, { color: colors.muted }]}>Conversațiile sunt păstrate local pe acest dispozitiv.</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Închide" onPress={() => setShowChats(false)} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={colors.muted} />
              </Pressable>
            </View>
            {renamingChatId ? (
              <View style={styles.renameRow}>
                <TextInput
                  accessibilityLabel="Numele conversației"
                  value={renameValue}
                  onChangeText={setRenameValue}
                  placeholder="Numele conversației"
                  placeholderTextColor={colors.muted}
                  maxLength={200}
                  style={[styles.renameInput, { color: colors.foreground, borderColor: colors.border }]}
                />
                <Pressable accessibilityRole="button" onPress={() => void commitRename()} style={[styles.renameSave, { backgroundColor: colors.primary }]}>
                  <Text style={styles.renameSaveText}>Salvează</Text>
                </Pressable>
              </View>
            ) : null}
            <ScrollView style={styles.chatList} keyboardShouldPersistTaps="handled">
              {chats.map((chat) => (
                <View key={chat.id} style={[styles.chatRow, { borderColor: colors.border, backgroundColor: chat.id === sessionId ? `${colors.primary}10` : colors.surface }]}>
                  <Pressable accessibilityRole="button" onPress={() => void openChat(chat)} style={styles.chatSelect}>
                    <Text numberOfLines={1} style={[styles.chatTitle, { color: colors.foreground }]}>{chat.title}</Text>
                    <Text style={[styles.chatMeta, { color: colors.muted }]}>{chat.subject} · {new Date(chat.updatedAt).toLocaleDateString("ro-RO")}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Redenumește ${chat.title}`} hitSlop={8} onPress={() => { setRenamingChatId(chat.id); setRenameValue(chat.title); }}>
                    <MaterialIcons name="edit" size={18} color={colors.primary} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Șterge ${chat.title}`} hitSlop={8} onPress={() => confirmDeleteChat(chat)}>
                    <MaterialIcons name="delete-outline" size={19} color={colors.error} />
                  </Pressable>
                </View>
              ))}
              {!chats.length ? <Text style={[styles.chatEmpty, { color: colors.muted }]}>Nu ai conversații salvate încă.</Text> : null}
            </ScrollView>
            <Pressable accessibilityRole="button" onPress={() => void startNewChat()} style={[styles.newChatButton, { backgroundColor: colors.primary }]}>
              <MaterialIcons name="add" size={19} color="#FFFFFF" />
              <Text style={styles.newChatText}>Chat nou</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
const styles = StyleSheet.create({
  topBar: { marginBottom: 0 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  chatsButton: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 11, paddingHorizontal: 9 },
  chatsButtonText: { fontSize: 11, fontWeight: "800" },
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
  attachmentList: { maxHeight: 34, marginBottom: 5 },
  attachmentItems: { alignItems: "center", gap: 6 },
  attachmentChip: { maxWidth: 200, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 },
  attachmentName: { flexShrink: 1, fontSize: 10, fontWeight: "700" },
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
    alignItems: "flex-start",
    flexWrap: "wrap",
    paddingVertical: 4,
    gap: 5,
  },
  footerActions: { flex: 1, minWidth: "100%", flexDirection: "row", flexWrap: "wrap", gap: 5 },
  footerAction: { justifyContent: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  modeToggle: { fontSize: 10, fontWeight: "800", textAlign: "center" },
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(20, 20, 40, 0.56)" },
  chatSheet: { width: "100%", maxWidth: 620, maxHeight: "82%", alignSelf: "center", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18 },
  chatSheetHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  chatSheetTitleWrap: { flex: 1, gap: 3 },
  chatSheetTitle: { fontSize: 20, fontWeight: "900" },
  chatSheetHint: { fontSize: 11, lineHeight: 16 },
  chatList: { flexShrink: 1 },
  chatRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, marginBottom: 8 },
  chatSelect: { flex: 1, justifyContent: "center", minHeight: 56 },
  chatTitle: { fontSize: 12, fontWeight: "800" },
  chatMeta: { fontSize: 10, marginTop: 4 },
  chatEmpty: { paddingVertical: 22, textAlign: "center", fontSize: 12 },
  newChatButton: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 13, marginTop: 8 },
  newChatText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  renameRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  renameInput: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, fontSize: 12 },
  renameSave: { minHeight: 42, borderRadius: 11, paddingHorizontal: 12, justifyContent: "center" },
  renameSaveText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
});
