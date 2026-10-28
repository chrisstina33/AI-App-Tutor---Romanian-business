import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { PropsWithChildren, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/use-colors";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.brandRow}>
      <View style={styles.brandSpark}>
        <View style={styles.brandSparkCore} />
      </View>
      {!compact && <Text style={styles.brandName}>elunariq</Text>}
    </View>
  );
}

export function ScreenHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        {eyebrow ? <Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow.toUpperCase()}</Text> : null}
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      {action}
    </View>
  );
}

export function IconButton({ icon, label, onPress, tone, size = 42 }: { icon: string; label: string; onPress?: () => void; tone?: string; size?: number }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, { width: size, height: size, backgroundColor: tone ?? colors.surface, borderColor: colors.border }, pressed && styles.pressed]}
    >
      <MaterialIcons name={icon as never} size={size * 0.48} color={tone ? "#FFFFFF" : colors.foreground} />
    </Pressable>
  );
}

export function SurfaceCard({ children, style, tone, onPress }: PropsWithChildren<{ style?: object; tone?: string; onPress?: () => void }>) {
  const colors = useColors();
  const body = <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, tone ? { borderLeftColor: tone, borderLeftWidth: 3 } : null, style]}>{children}</View>;
  if (!onPress) return body;
  return <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [pressed && styles.pressed]}>{body}</Pressable>;
}

export function SectionHeading({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.sectionHeading}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      {action ? <Pressable accessibilityRole="button" onPress={onPress}><Text style={[styles.sectionAction, { color: colors.primary }]}>{action}</Text></Pressable> : null}
    </View>
  );
}

export function ProgressBar({ value, color, height = 8 }: { value: number; color?: string; height?: number }) {
  const colors = useColors();
  return <View style={[styles.progressTrack, { height, backgroundColor: colors.border }]}><View style={[styles.progressFill, { width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: color ?? colors.primary }]} /></View>;
}

export function Badge({ children, tone }: PropsWithChildren<{ tone?: string }>) {
  const colors = useColors();
  return <View style={[styles.badge, { backgroundColor: tone ? `${tone}18` : `${colors.primary}16` }]}><Text style={[styles.badgeText, { color: tone ?? colors.primary }]}>{children}</Text></View>;
}

export function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  const colors = useColors();
  return <View style={styles.emptyState}><MaterialIcons name={icon as never} size={34} color={colors.muted} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.emptyBody, { color: colors.muted }]}>{body}</Text></View>;
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandSpark: { width: 28, height: 28, backgroundColor: "#8A72FF", transform: [{ rotate: "45deg" }], alignItems: "center", justifyContent: "center", borderRadius: 8 },
  brandSparkCore: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#12152A" },
  brandName: { fontSize: 21, fontWeight: "800", letterSpacing: -0.6, color: "#171A32" },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 22 },
  headerCopy: { flex: 1, gap: 7 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  screenTitle: { fontSize: 30, lineHeight: 34, fontWeight: "800", letterSpacing: -0.8 },
  iconButton: { borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  card: { borderRadius: 22, borderWidth: 1, padding: 18, shadowColor: "#15162D", shadowOpacity: 0.05, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 2 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  sectionAction: { fontSize: 13, fontWeight: "700" },
  progressTrack: { width: "100%", borderRadius: 99, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 99 },
  badge: { alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99 },
  badgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
  emptyState: { alignItems: "center", paddingVertical: 32, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "800" },
  emptyBody: { maxWidth: 260, textAlign: "center", fontSize: 13, lineHeight: 19 },
});
