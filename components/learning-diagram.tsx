import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { diagramSvg, type DiagramKind } from "@/lib/diagrams";
import { tutorDrawingSvg } from "@/lib/tutor-drawing";
import type { TutorDrawing } from "@/shared/tutor-drawing";
import { useColors } from "@/hooks/use-colors";

export function LearningDiagram({ kind, caption, drawing }: { kind?: DiagramKind; caption?: string; drawing?: TutorDrawing }) {
  const colors = useColors();
  const svg = drawing ? tutorDrawingSvg(drawing) : kind ? diagramSvg(kind) : "";
  const title = drawing?.caption ?? caption ?? "Schiță de lecție";
  return <View style={[styles.card, { borderColor: colors.border }]}>
    <View style={styles.sketchHeading}><MaterialIcons name="edit" size={14} color={colors.primary} /><Text style={[styles.sketchTitle, { color: colors.primary }]}>Desen explicativ</Text></View>
    {drawing?.steps.map((step, index) => <View key={`${index}-${step.calculation}`} style={styles.stepRow}>
      <Text style={[styles.stepNumber, { color: colors.primary }]}>{index + 1}.</Text>
      <View style={styles.stepCopy}><Text style={[styles.calculation, { color: colors.foreground }]}>{step.calculation}</Text><Text style={[styles.meaning, { color: colors.muted }]}>{step.meaning}</Text></View>
    </View>)}
    <SvgXml xml={svg} width="100%" height={drawing ? 205 : 180} />
    <Text style={[styles.caption, { color: colors.muted }]}>{title} · verifică etichetele cu enunțul</Text>
  </View>;
}

const styles = StyleSheet.create({ card: { borderWidth: 1, borderRadius: 16, padding: 9, marginTop: 10, backgroundColor: "#FFFFFF" }, sketchHeading: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 3, paddingBottom: 5 }, sketchTitle: { fontSize: 10, fontWeight: "800" }, stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingVertical: 3, paddingHorizontal: 3 }, stepNumber: { fontSize: 12, fontWeight: "900" }, stepCopy: { flex: 1, gap: 1 }, calculation: { fontSize: 12, fontWeight: "800" }, meaning: { fontSize: 10, lineHeight: 14 }, caption: { fontSize: 10, lineHeight: 15, textAlign: "center", paddingBottom: 3 } });
