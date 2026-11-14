import { StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { diagramSvg, type DiagramKind } from "@/lib/diagrams";
import { useColors } from "@/hooks/use-colors";

export function LearningDiagram({ kind, caption }: { kind: DiagramKind; caption: string }) {
  const colors = useColors();
  return <View style={[styles.card, { borderColor: colors.border }]}>
    <SvgXml xml={diagramSvg(kind)} width="100%" height={180} />
    <Text style={[styles.caption, { color: colors.muted }]}>{caption} · verifică etichetele cu enunțul</Text>
  </View>;
}

const styles = StyleSheet.create({ card: { borderWidth: 1, borderRadius: 16, padding: 8, marginTop: 10, backgroundColor: "#FFFFFF" }, caption: { fontSize: 10, lineHeight: 15, textAlign: "center", paddingBottom: 3 } });
