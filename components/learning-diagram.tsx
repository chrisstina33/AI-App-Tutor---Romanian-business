import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { diagramSvg } from "@/lib/diagrams";
import type { TutorDiagram } from "@/shared/tutor-diagram";
import { useColors } from "@/hooks/use-colors";

export function LearningDiagram({ diagram }: { diagram: TutorDiagram }) {
  const colors = useColors();
  const svg = diagramSvg(diagram);
  return <View style={[styles.card, { borderColor: colors.border }]}>
    <View style={styles.sketchHeading}><MaterialIcons name="edit" size={14} color={colors.primary} /><Text style={[styles.sketchTitle, { color: colors.primary }]}>Desen explicativ</Text></View>
    {diagram.category === "schematic" ? diagram.steps.map((step, index) => <View key={`${index}-${step.calculation}`} style={styles.stepRow}>
      <Text style={[styles.stepNumber, { color: colors.primary }]}>{index + 1}.</Text>
      <View style={styles.stepCopy}><Text style={[styles.calculation, { color: colors.foreground }]}>{step.calculation}</Text><Text style={[styles.meaning, { color: colors.muted }]}>{step.meaning}</Text></View>
    </View>) : null}
    <SvgXml xml={svg} width="100%" height={210} />
    {diagram.category !== "schematic" && diagram.constraints.length > 0 ? <Text style={[styles.constraints, { color: colors.foreground }]}>{diagram.constraints.join(" · ")}</Text> : null}
    <Text style={[styles.caption, { color: colors.muted }]}>{diagram.caption} · {diagram.schematic ? "reprezentare schematică, nu este la scară" : "verifică etichetele cu enunțul"}</Text>
  </View>;
}

const styles = StyleSheet.create({ card: { borderWidth: 1, borderRadius: 16, padding: 9, marginTop: 10, backgroundColor: "#FFFFFF" }, sketchHeading: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 3, paddingBottom: 5 }, sketchTitle: { fontSize: 10, fontWeight: "800" }, stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingVertical: 3, paddingHorizontal: 3 }, stepNumber: { fontSize: 12, fontWeight: "900" }, stepCopy: { flex: 1, gap: 1 }, calculation: { fontSize: 12, fontWeight: "800" }, meaning: { fontSize: 10, lineHeight: 14 }, constraints: { fontSize: 11, lineHeight: 16, textAlign: "center", paddingHorizontal: 6, paddingBottom: 5 }, caption: { fontSize: 10, lineHeight: 15, textAlign: "center", paddingBottom: 3 } });
