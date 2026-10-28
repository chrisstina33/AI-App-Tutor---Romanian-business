import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { Badge, IconButton, ProgressBar, ScreenHeader, SectionHeading, SurfaceCard } from "@/components/bionis-ui";
import { useColors } from "@/hooks/use-colors";
import { SUBJECTS } from "@/lib/app-data";
import { generateLearningPdf } from "@/lib/pdf";
import { ro } from "@/lib/i18n";
import { useLearnerData } from "@/lib/learner-context";

export default function ProgressScreen() {
  const colors = useColors();
  const { state, loading } = useLearnerData();
  const [pdfBusy, setPdfBusy] = useState(false);
  const recentLessons = useMemo(
    () => [...state.lessonActivity].sort(
      (a, b) => new Date(b.lastStudiedAt).getTime() - new Date(a.lastStudiedAt).getTime(),
    ),
    [state.lessonActivity],
  );
  const activeDays = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    return new Set(
      recentLessons
        .map((lesson) => new Date(lesson.lastStudiedAt))
        .filter((date) => !Number.isNaN(date.getTime()) && date >= start)
        .map((date) => String(date.getFullYear()) + "-" + String(date.getMonth()) + "-" + String(date.getDate())),
    ).size;
  }, [recentLessons]);

  async function exportWeeklyRecap() {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      await generateLearningPdf("Progresul tău · Elunariq", [
        { heading: "Activitate", body: String(state.questionsAsked) + " întrebări adresate tutorului în " + String(state.lessonActivity.length) + " lecții." },
        {
          heading: "Lecții recente",
          body: recentLessons.length
            ? recentLessons.map((lesson) => lesson.subject + ": " + lesson.title + " · " + String(lesson.questionCount) + " întrebări").join("\n")
            : "Nu ai început încă o lecție. Alege o materie și trimite prima întrebare tutorului.",
        },
        { heading: "Următorul pas", body: "Continuă lecția și explică primul pas cu propriile cuvinte." },
      ]);
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <ScreenContainer safeAreaClassName="px-5">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <ScreenHeader
            eyebrow={ro.progressEyebrow}
            title={ro.progress}
            action={<IconButton icon="insights" label="Vezi analiza progresului" />}
          />
        </View>

        <SurfaceCard style={styles.streakCard}>
          <View style={styles.streakCopy}>
            <Badge tone={colors.success}>{activeDays ? "RITMUL TĂU" : "PRIMUL PAS"}</Badge>
            <Text style={[styles.streakTitle, { color: colors.foreground }]}>
              {activeDays ? String(activeDays) + (activeDays === 1 ? " zi activă" : " zile active") : "Începe prima lecție"}
            </Text>
            <Text style={[styles.streakBody, { color: colors.muted }]}>
              {activeDays ? "Zile cu activitate în ultimele 7 zile." : "Întrebările trimise tutorului vor apărea aici."}
            </Text>
          </View>
          <View style={[styles.streakCircle, { borderColor: colors.primary }]}>
            <Text style={[styles.streakNumber, { color: colors.primary }]}>{activeDays}</Text>
            <Text style={[styles.streakLabel, { color: colors.muted }]}>din 7</Text>
          </View>
        </SurfaceCard>

        <View style={styles.statGrid}>
          <SurfaceCard style={styles.statCard}>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Întrebări cu tutorul</Text>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{state.questionsAsked}</Text>
            <Text style={[styles.statHint, { color: colors.muted }]}>salvate în activitatea ta</Text>
          </SurfaceCard>
          <SurfaceCard style={styles.statCard}>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Lecții accesate</Text>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{state.lessonActivity.length}</Text>
            <Text style={[styles.statHint, { color: colors.muted }]}>actualizate la fiecare întrebare</Text>
          </SurfaceCard>
        </View>

        <SectionHeading title="Activitate pe materii" />
        <Text style={[styles.sectionHint, { color: colors.muted }]}>
          Barele arată activitatea raportată la un obiectiv orientativ de 5 întrebări pe materie.
        </Text>
        <View style={styles.subjectGrid}>
          {SUBJECTS.map((subject) => {
            const questionCount = state.lessonActivity
              .filter((lesson) => lesson.subject === subject.label)
              .reduce((total, lesson) => total + lesson.questionCount, 0);
            return (
              <SurfaceCard key={subject.id} style={styles.subjectCard}>
                <View style={styles.subjectHeader}>
                  <View style={[styles.subjectIcon, { backgroundColor: subject.tint + "18" }]}>
                    <MaterialIcons name={subject.icon as never} size={19} color={subject.tint} />
                  </View>
                  <Text style={[styles.subjectPercent, { color: subject.tint }]}>{questionCount}</Text>
                </View>
                <Text style={[styles.subjectTitle, { color: colors.foreground }]}>{subject.shortLabel}</Text>
                <ProgressBar value={Math.min(questionCount / 5, 1)} color={subject.tint} height={6} />
                <Text style={[styles.subjectMeta, { color: colors.muted }]}>
                  {questionCount === 1 ? "1 întrebare" : String(questionCount) + " întrebări"}
                </Text>
              </SurfaceCard>
            );
          })}
        </View>

        <SectionHeading title="Lecții recente" action={recentLessons.length ? "Deschide ghidul" : undefined} onPress={() => router.push("/tutor")} />
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : recentLessons.length ? (
          recentLessons.slice(0, 8).map((lesson) => (
            <SurfaceCard key={lesson.id} style={styles.lessonRow} onPress={() => router.push("/tutor")}>
              <View style={[styles.lessonDot, { backgroundColor: SUBJECTS.find((item) => item.label === lesson.subject)?.tint ?? colors.primary }]} />
              <View style={styles.lessonCopy}>
                <Text style={[styles.lessonTitle, { color: colors.foreground }]}>{lesson.title}</Text>
                <Text style={[styles.lessonMeta, { color: colors.muted }]}>
                  {lesson.subject} · {lesson.questionCount} {lesson.questionCount === 1 ? "întrebare" : "întrebări"} · {formatLastStudied(lesson.lastStudiedAt)}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={19} color={colors.muted} />
            </SurfaceCard>
          ))
        ) : (
          <SurfaceCard style={styles.emptyCard}>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Lecțiile tale vor apărea aici</Text>
            <Text style={[styles.emptyBody, { color: colors.muted }]}>Trimite o întrebare tutorului pentru a începe să construiești progresul tău.</Text>
          </SurfaceCard>
        )}

        <SectionHeading title={ro.weeklyRecap} />
        <SurfaceCard tone={colors.warning}>
          <View style={styles.revisionTop}>
            <View>
              <Text style={[styles.revisionEyebrow, { color: colors.warning }]}>GENERATĂ DIN ACTIVITATEA TA</Text>
              <Text style={[styles.revisionTitle, { color: colors.foreground }]}>Recapitularea progresului</Text>
            </View>
            <MaterialIcons name="description" size={28} color={colors.warning} />
          </View>
          <Text style={[styles.revisionBody, { color: colors.muted }]}>
            Fișa folosește lecțiile și întrebările salvate în contul tău.
          </Text>
          <Pressable accessibilityRole="button" onPress={exportWeeklyRecap} style={[styles.pdfButton, { backgroundColor: colors.primary }]}>
            {pdfBusy ? <ActivityIndicator color="#FFFFFF" /> : <><MaterialIcons name="picture-as-pdf" size={16} color="#FFFFFF" /><Text style={styles.pdfText}>Generează PDF</Text></>}
          </Pressable>
        </SurfaceCard>

        <SurfaceCard style={styles.parentCard}>
          <View style={styles.parentTop}>
            <MaterialIcons name="family-restroom" size={22} color={colors.primary} />
            <Text style={[styles.parentTitle, { color: colors.foreground }]}>Spațiu pentru părinte</Text>
          </View>
          <Text style={[styles.parentBody, { color: colors.muted }]}>
            Legarea unui cont de părinte va fi disponibilă după configurarea fluxului dedicat.
          </Text>
          <Badge tone={colors.muted}>Control de confidențialitate</Badge>
        </SurfaceCard>
        <Text style={[styles.disclaimer, { color: colors.muted }]}>
          Progresul măsoară întrebările trimise tutorului, nu note școlare sau corectitudinea răspunsurilor.
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}

function formatLastStudied(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "dată necunoscută";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "astăzi";
  if (days === 1) return "ieri";
  return date.toLocaleDateString("ro-RO", { day: "numeric", month: "short" });
}

const styles = StyleSheet.create({
  content: { paddingTop: 18, paddingBottom: 32 },
  topBar: { marginBottom: 0 },
  streakCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  streakCopy: { flex: 1, gap: 8, paddingRight: 15 },
  streakTitle: { fontSize: 24, fontWeight: "800", letterSpacing: -0.7 },
  streakBody: { fontSize: 12, lineHeight: 18 },
  streakCircle: { width: 92, height: 92, borderRadius: 46, borderWidth: 5, alignItems: "center", justifyContent: "center" },
  streakNumber: { fontSize: 28, fontWeight: "900" },
  streakLabel: { fontSize: 10, fontWeight: "800" },
  statGrid: { flexDirection: "row", gap: 10, marginBottom: 27 },
  statCard: { flex: 1, padding: 14 },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 25, fontWeight: "900", marginVertical: 6 },
  statHint: { fontSize: 10, lineHeight: 15 },
  sectionHint: { fontSize: 11, lineHeight: 16, marginTop: -5, marginBottom: 12 },
  subjectGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 27 },
  subjectCard: { width: "48%", padding: 13, gap: 8 },
  subjectHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  subjectIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  subjectPercent: { fontSize: 15, fontWeight: "900" },
  subjectTitle: { fontSize: 14, fontWeight: "800" },
  subjectMeta: { fontSize: 10 },
  lessonRow: { flexDirection: "row", alignItems: "center", gap: 11, padding: 14, marginBottom: 9 },
  lessonDot: { width: 9, height: 9, borderRadius: 5 },
  lessonCopy: { flex: 1, gap: 4 },
  lessonTitle: { fontSize: 13, fontWeight: "800", lineHeight: 17 },
  lessonMeta: { fontSize: 11 },
  emptyCard: { gap: 8, marginBottom: 14 },
  emptyTitle: { fontSize: 14, fontWeight: "800" },
  emptyBody: { fontSize: 12, lineHeight: 18 },
  revisionTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 15 },
  revisionEyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginBottom: 7 },
  revisionTitle: { flex: 1, fontSize: 18, lineHeight: 22, fontWeight: "800" },
  revisionBody: { fontSize: 12, lineHeight: 18, marginTop: 14 },
  pdfButton: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, marginTop: 17 },
  pdfText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  parentCard: { marginTop: 12, gap: 10 },
  parentTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  parentTitle: { fontSize: 15, fontWeight: "800" },
  parentBody: { fontSize: 12, lineHeight: 18 },
  disclaimer: { fontSize: 11, lineHeight: 17, marginTop: 21, paddingHorizontal: 3 },
});
