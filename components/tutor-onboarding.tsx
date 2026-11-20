import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useColors } from "@/hooks/use-colors";
import type { Preferences, SchoolGrade } from "@/lib/storage";
import { SUBJECTS } from "@/lib/app-data";
import {
  getDiagnosticQuestions,
  getSuggestedTopics,
  parseAdditionalTopics,
} from "@/services/tutor-onboarding";

type LearnerLevel = Preferences["level"];
type TutorSetup = {
  subject: string;
  subjects: string[];
  schoolGrade: SchoolGrade;
  level: LearnerLevel;
  studiedTopics: string[];
  diagnosticScore: number;
  diagnosticAnswers: boolean[];
};

const GRADES: SchoolGrade[] = [
  "Nu o precizez",
  "Clasa a V-a",
  "Clasa a VI-a",
  "Clasa a VII-a",
  "Clasa a VIII-a",
  "Clasa a IX-a",
  "Clasa a X-a",
  "Clasa a XI-a",
  "Clasa a XII-a",
];
const LEVELS: LearnerLevel[] = [
  "La început",
  "Îmi formez încrederea",
  "Pregătit pentru examen",
];

export function TutorOnboarding({
  canDismiss,
  subject,
  prioritySubjects,
  schoolGrade,
  level,
  studiedTopics,
  onComplete,
  onClose,
}: {
  canDismiss: boolean;
  subject: string;
  prioritySubjects?: string[];
  schoolGrade: SchoolGrade;
  level: LearnerLevel;
  studiedTopics: string[];
  onComplete: (setup: TutorSetup) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const [step, setStep] = useState(0);
  const [selectedSubject, setSelectedSubject] = useState(subject);
  const [selectedSubjects, setSelectedSubjects] = useState(
    prioritySubjects?.length ? prioritySubjects : [subject],
  );
  const [selectedGrade, setSelectedGrade] = useState(schoolGrade);
  const [selectedLevel, setSelectedLevel] = useState(level);
  const [selectedTopics, setSelectedTopics] = useState<string[]>(studiedTopics);
  const [additionalTopics, setAdditionalTopics] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [quizFinished, setQuizFinished] = useState(false);
  const animation = useRef(new Animated.Value(0)).current;
  const questions = useMemo(
    () => getDiagnosticQuestions(selectedSubject),
    [selectedSubject],
  );
  const currentQuestion = questions[questionIndex];
  const isQuizStep = step >= 4;
  const suggestedTopics = useMemo(
    () => getSuggestedTopics(selectedSubject),
    [selectedSubject],
  );
  const totalSteps = 4 + questions.length;
  const currentStep = quizFinished
    ? totalSteps
    : isQuizStep
      ? Math.min(totalSteps, 5 + questionIndex)
      : step + 1;
  const correctAnswers =
    answers.filter(Boolean).length +
    (selectedAnswer === currentQuestion?.correctIndex ? 1 : 0);

  useEffect(() => {
    animation.setValue(0);
    const transition = Animated.timing(animation, {
      toValue: 1,
      duration: step === 0 && questionIndex === 0 && !quizFinished ? 300 : 220,
      useNativeDriver: true,
    });
    transition.start();
    return () => transition.stop();
  }, [animation, questionIndex, step, quizFinished]);

  function toggleTopic(topic: string) {
    setSelectedTopics((current) =>
      current.includes(topic)
        ? current.filter((item) => item !== topic)
        : [...current, topic],
    );
  }

  function submitAnswer() {
    if (selectedAnswer === null || !currentQuestion) return;
    setAnswers((current) => [
      ...current,
      selectedAnswer === currentQuestion.correctIndex,
    ]);
    setSelectedAnswer(null);
    if (questionIndex < questions.length - 1) {
      setQuestionIndex((current) => current + 1);
    } else {
      setQuizFinished(true);
    }
  }

  function finishSetup() {
    const topics = [
      ...new Set([
        ...selectedTopics,
        ...parseAdditionalTopics(additionalTopics),
      ]),
    ].slice(0, 30);
    onComplete({
      subject: selectedSubject,
      subjects: selectedSubjects,
      schoolGrade: selectedGrade,
      level: selectedLevel,
      studiedTopics: topics,
      diagnosticScore: answers.filter(Boolean).length,
      diagnosticAnswers: answers,
    });
  }

  const animatedStyle = {
    opacity: animation,
    transform: [
      {
        translateY: animation.interpolate({
          inputRange: [0, 1],
          outputRange: [16, 0],
        }),
      },
      {
        scale: animation.interpolate({
          inputRange: [0, 1],
          outputRange: [0.98, 1],
        }),
      },
    ],
  };

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={() => {
        if (canDismiss) onClose();
      }}
    >
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: colors.background },
            animatedStyle,
          ]}
        >
          <View style={styles.header}>
            <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}18` }]}>
              <MaterialIcons name="auto-awesome" size={22} color={colors.primary} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>
                GHID PERSONALIZAT
              </Text>
              <Text style={[styles.title, { color: colors.foreground }]}>
                Hai să găsim punctul potrivit de pornire
              </Text>
            </View>
            {canDismiss ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Închide configurarea"
                onPress={onClose}
                hitSlop={8}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={21} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>

          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${(currentStep / totalSteps) * 100}%`,
                  backgroundColor: colors.primary,
                },
              ]}
            />
          </View>
          <Text style={[styles.stepLabel, { color: colors.muted }]}>
            {quizFinished
              ? "GATA · MINI-QUIZ"
              : `PASUL ${currentStep} DIN ${totalSteps}`}
          </Text>

          <ScrollView
            key={`${step}-${questionIndex}-${quizFinished}`}
            style={styles.content}
            contentContainerStyle={styles.contentInner}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View>
              {step === 0 ? (
                <>
                  <Text style={[styles.questionTitle, { color: colors.foreground }]}>
                    În ce clasă ești?
                  </Text>
                  <Text style={[styles.description, { color: colors.muted }]}>
                    Așa păstrăm explicațiile în programa și limbajul potrivite.
                  </Text>
                  <View style={styles.gradeGrid}>
                    {GRADES.map((grade) => (
                      <ChoiceChip
                        key={grade}
                        label={grade === "Nu o precizez" ? "Prefer să nu spun" : grade}
                        selected={selectedGrade === grade}
                        onPress={() => setSelectedGrade(grade)}
                      />
                    ))}
                  </View>
                  <Text style={[styles.description, { color: colors.muted, marginTop: 10, marginBottom: 0 }]}>
                    Clasa este opțională. Poți continua fără să o precizezi.
                  </Text>
                </>
              ) : null}

              {step === 1 ? (
                <>
                  <Text style={[styles.questionTitle, { color: colors.foreground }]}>
                    Cum te simți când lucrezi la materii?
                  </Text>
                  <Text style={[styles.description, { color: colors.muted }]}>
                    Alegerea ne ajută să calibrăm primul pas; nu este o notă.
                  </Text>
                  <View style={styles.levelList}>
                    {LEVELS.map((learnerLevel, index) => (
                      <Pressable
                        key={learnerLevel}
                        accessibilityRole="button"
                        accessibilityState={{ selected: selectedLevel === learnerLevel }}
                        onPress={() => setSelectedLevel(learnerLevel)}
                        style={[
                          styles.levelOption,
                          {
                            borderColor: selectedLevel === learnerLevel ? colors.primary : colors.border,
                            backgroundColor: selectedLevel === learnerLevel ? `${colors.primary}12` : colors.surface,
                          },
                        ]}
                      >
                        <Text style={[styles.levelNumber, { color: colors.primary }]}>0{index + 1}</Text>
                        <Text style={[styles.levelText, { color: colors.foreground }]}>{learnerLevel}</Text>
                        {selectedLevel === learnerLevel ? <MaterialIcons name="check-circle" size={19} color={colors.primary} /> : null}
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <Text style={[styles.questionTitle, { color: colors.foreground }]}>
                    La ce materii ai nevoie de ajutor acum?
                  </Text>
                  <Text style={[styles.description, { color: colors.muted }]}>
                    Alege una sau mai multe. Prima materie va primi mini-quizul.
                  </Text>
                  <View style={styles.topicList}>
                    {SUBJECTS.map((item) => (
                      <ChoiceChip
                        key={item.id}
                        label={item.shortLabel}
                        selected={selectedSubjects.includes(item.label)}
                        onPress={() => {
                          const current = selectedSubjects;
                          if (current.includes(item.label) && current.length === 1) return;
                          const next = current.includes(item.label)
                            ? current.filter((value) => value !== item.label)
                            : [...current, item.label];
                          setSelectedSubjects(next);
                          if (!next.includes(selectedSubject)) {
                            setSelectedSubject(next[0]);
                            setSelectedTopics([]);
                            setQuestionIndex(0);
                            setSelectedAnswer(null);
                            setAnswers([]);
                          }
                        }}
                      />
                    ))}
                  </View>
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <Text style={[styles.questionTitle, { color: colors.foreground }]}>
                    Ce teme ai studiat la {selectedSubject}?
                  </Text>
                  <Text style={[styles.description, { color: colors.muted }]}>
                    Bifează doar temele parcurse; nu vom presupune că știi ce nu ai selectat.
                  </Text>
                  <Text style={[styles.fieldLabel, { color: colors.muted }]}>
                    TEME LA {selectedSubject.toLocaleUpperCase("ro-RO")}
                  </Text>
                  <View style={styles.topicList}>
                    {suggestedTopics.map((topic) => (
                      <ChoiceChip
                        key={topic}
                        label={topic}
                        selected={selectedTopics.includes(topic)}
                        onPress={() => toggleTopic(topic)}
                      />
                    ))}
                  </View>
                  <TextInput
                    accessibilityLabel="Alte teme studiate"
                    value={additionalTopics}
                    onChangeText={setAdditionalTopics}
                    placeholder="Altă temă (poți scrie mai multe, separate prin virgulă)"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.topicInput,
                      {
                        color: colors.foreground,
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  />
                </>
              ) : null}

              {isQuizStep && !quizFinished && currentQuestion ? (
                <>
                  <Text style={[styles.questionTitle, { color: colors.foreground }]}>
                    Mini-quiz · {selectedSubject}
                  </Text>
                  <Text style={[styles.description, { color: colors.muted }]}>
                    Nu e test și nu se notează. Ne ajută doar să începem la nivelul potrivit.
                  </Text>
                  <View style={styles.quizCounter}>
                    <MaterialIcons name="psychology" size={17} color={colors.primary} />
                    <Text style={[styles.quizCounterText, { color: colors.primary }]}>
                      Întrebarea {questionIndex + 1} din {questions.length}
                    </Text>
                  </View>
                  <Text style={[styles.quizQuestion, { color: colors.foreground }]}>
                    {currentQuestion.question}
                  </Text>
                  <View style={styles.answerList}>
                    {currentQuestion.options.map((option, index) => (
                      <Pressable
                        key={option}
                        accessibilityRole="button"
                        accessibilityState={{ selected: selectedAnswer === index }}
                        onPress={() => setSelectedAnswer(index)}
                        style={[
                          styles.answerOption,
                          {
                            borderColor:
                              selectedAnswer === index ? colors.primary : colors.border,
                            backgroundColor:
                              selectedAnswer === index ? `${colors.primary}12` : colors.surface,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.answerLetter,
                            {
                              backgroundColor:
                                selectedAnswer === index ? colors.primary : colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.answerLetterText,
                              { color: selectedAnswer === index ? "#FFFFFF" : colors.muted },
                            ]}
                          >
                            {String.fromCharCode(65 + index)}
                          </Text>
                        </View>
                        <Text style={[styles.answerText, { color: colors.foreground }]}>
                          {option}
                        </Text>
                        {selectedAnswer === index ? (
                          <MaterialIcons name="check-circle" size={19} color={colors.primary} />
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                  {selectedAnswer !== null ? (
                    <Text style={[styles.description, { color: colors.muted, marginTop: 10, marginBottom: 0 }]}>
                      {selectedAnswer === currentQuestion.correctIndex
                        ? "Răspuns potrivit. Continuă la următoarea întrebare."
                        : "Nu este varianta potrivită. Reține tema pentru recapitulare."}
                    </Text>
                  ) : null}
                </>
              ) : null}

              {isQuizStep && !quizFinished && !currentQuestion ? (
                <View>
                  <Text style={[styles.questionTitle, { color: colors.foreground }]}>
                    Mini-quizul nu este disponibil acum.
                  </Text>
                  <Text style={[styles.description, { color: colors.muted }]}>
                    Poți continua fără diagnostic și poți începe direct conversația.
                  </Text>
                </View>
              ) : null}

              {isQuizStep && quizFinished ? (
                <View style={styles.result}>
                  <View style={[styles.resultIcon, { backgroundColor: `${colors.success}18` }]}>
                    <MaterialIcons name="celebration" size={31} color={colors.success} />
                  </View>
                  <Text style={[styles.questionTitle, styles.resultTitle, { color: colors.foreground }]}>
                    Gata, avem punctul de pornire!
                  </Text>
                  <Text style={[styles.resultScore, { color: colors.primary }]}>
                    {correctAnswers} din {questions.length} răspunsuri corecte
                  </Text>
                  <Text style={[styles.description, styles.resultCopy, { color: colors.muted }]}>
                    Nivelul ales: {selectedLevel}. Poți să-l schimbi oricând din profil. Voi explica pe pași simpli și nu voi presupune că ai studiat alte teme.
                  </Text>
                </View>
              ) : null}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {isQuizStep && !quizFinished ? (
              <Pressable
                accessibilityRole="button"
                onPress={finishSetup}
                style={styles.skipQuizButton}
              >
                <Text style={[styles.backText, { color: colors.muted }]}>
                  Sari peste mini-quiz
                </Text>
              </Pressable>
            ) : null}
            {step > 0 && !quizFinished ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (isQuizStep) {
                    if (questionIndex > 0) {
                      setQuestionIndex((current) => current - 1);
                      setAnswers((current) => current.slice(0, -1));
                    } else setStep(3);
                  } else setStep((current) => current - 1);
                  setSelectedAnswer(null);
                }}
                style={[styles.backButton, { borderColor: colors.border }]}
              >
                <Text style={[styles.backText, { color: colors.muted }]}>Înapoi</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={isQuizStep && !quizFinished && currentQuestion !== undefined && selectedAnswer === null}
              onPress={() => {
                if (quizFinished) {
                  finishSetup();
                } else if (isQuizStep) {
                  if (currentQuestion) submitAnswer();
                  else finishSetup();
                } else {
                  setStep((current) => current + 1);
                }
              }}
              style={[
                styles.nextButton,
                {
                  backgroundColor:
                    isQuizStep && !quizFinished && currentQuestion !== undefined && selectedAnswer === null
                      ? colors.border
                      : colors.primary,
                },
              ]}
            >
              <Text style={styles.nextText}>
                {quizFinished
                  ? "Începem să învățăm"
                  : isQuizStep
                    ? currentQuestion
                      ? questionIndex === questions.length - 1
                        ? "Vezi rezultatul"
                        : "Următoarea întrebare"
                      : "Continuă fără mini-quiz"
                    : step === 0 && selectedGrade === "Nu o precizez"
                      ? "Continuă fără clasă"
                      : "Continuă"}
              </Text>
              <MaterialIcons
                name={quizFinished ? "rocket-launch" : "arrow-forward"}
                size={18}
                color="#FFFFFF"
              />
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );

  function ChoiceChip({
    label,
    selected,
    onPress,
  }: {
    label: string;
    selected: boolean;
    onPress: () => void;
  }) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onPress}
        style={[
          styles.chip,
          {
            backgroundColor: selected ? `${colors.primary}14` : colors.surface,
            borderColor: selected ? colors.primary : colors.border,
          },
        ]}
      >
        <Text style={[styles.chipText, { color: selected ? colors.primary : colors.foreground }]}>
          {label}
        </Text>
      </Pressable>
    );
  }
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
    backgroundColor: "rgba(20, 20, 40, 0.56)",
  },
  card: {
    width: "100%",
    maxWidth: 560,
    height: "92%",
    maxHeight: 560,
    borderRadius: 24,
    padding: 20,
    overflow: "hidden",
    flexDirection: "column",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 15 },
  iconWrap: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 9, fontWeight: "900", letterSpacing: 1.4, marginBottom: 4 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: "900" },
  closeButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  progressTrack: { height: 5, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4 },
  stepLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1.2, marginTop: 9, marginBottom: 8 },
  content: { flex: 1, minHeight: 0 },
  contentInner: { paddingBottom: 10 },
  questionTitle: { fontSize: 19, lineHeight: 24, fontWeight: "900", marginTop: 6 },
  description: { fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 14 },
  gradeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  chipText: { fontSize: 11, fontWeight: "700" },
  levelHeading: { marginTop: 20, marginBottom: 9 },
  levelList: { gap: 7 },
  levelOption: { minHeight: 44, borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 10 },
  levelNumber: { fontSize: 10, fontWeight: "900" },
  levelText: { flex: 1, fontSize: 12, fontWeight: "700" },
  subjectList: { gap: 7, paddingVertical: 3, paddingBottom: 13 },
  fieldLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 1.1, marginBottom: 8 },
  topicList: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  topicInput: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, marginTop: 11, fontSize: 12 },
  quizCounter: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 13 },
  quizCounterText: { fontSize: 11, fontWeight: "800" },
  quizQuestion: { fontSize: 16, lineHeight: 23, fontWeight: "800", marginBottom: 13 },
  answerList: { gap: 8 },
  answerOption: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 10 },
  answerLetter: { width: 27, height: 27, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  answerLetterText: { fontSize: 10, fontWeight: "900" },
  answerText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  result: { alignItems: "center", paddingVertical: 24 },
  resultIcon: { width: 62, height: 62, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  resultTitle: { textAlign: "center" },
  resultScore: { fontSize: 14, fontWeight: "900", marginTop: 10 },
  resultCopy: { textAlign: "center", maxWidth: 380 },
  footer: { flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingTop: 10 },
  skipQuizButton: { minHeight: 44, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  backButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  backText: { fontSize: 12, fontWeight: "800" },
  nextButton: { minHeight: 44, paddingHorizontal: 15, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  nextText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
});
