import * as DocumentPicker from "expo-document-picker";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useColors } from "@/hooks/use-colors";
import type { PendingUpload } from "@/lib/storage";
import { formatLatexForDisplay, splitMathSegments } from "@/lib/math-format";
import type { TutorMessage } from "@/services/ai-service";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "image/png",
  "image/jpeg",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export function TutorMessageCard({ message }: { message: TutorMessage }) {
  const colors = useColors();
  const assistant = message.role === "assistant";
  return (
    <View style={[styles.messageRow, !assistant && styles.messageRowUser]}>
      {assistant ? (
        <View
          style={[
            styles.messageRail,
            {
              backgroundColor:
                message.mode === "hint" ? colors.primary : colors.success,
            },
          ]}
        />
      ) : null}
      <View
        style={[
          styles.messageBubble,
          {
            backgroundColor: assistant ? colors.surface : `${colors.primary}16`,
            borderColor: assistant ? colors.border : `${colors.primary}35`,
          },
        ]}
      >
        <View style={styles.messageMeta}>
          <Text
            style={[
              styles.messageAuthor,
              { color: assistant ? colors.foreground : colors.primary },
            ]}
          >
            {assistant ? "Elunariq" : "Tu"}
          </Text>
        </View>
        {message.text.split("\n").map((line, index) => {
          const heading = line.startsWith("#");
          const bullet = line.startsWith("-") || /^\d\./.test(line);
          return (
            <Text
              key={`${message.id}-${index}`}
              style={[
                styles.messageText,
                { color: colors.foreground },
                heading && styles.messageHeading,
                bullet && styles.messageBullet,
              ]}
            >
              {splitMathSegments(line.replace(/^#+\s?/, "")).map(
                (segment, segmentIndex) =>
                  segment.isMath ? (
                    <Text
                      key={`${message.id}-${index}-math-${segmentIndex}`}
                      style={styles.formula}
                    >
                      {formatLatexForDisplay(segment.value)}
                    </Text>
                  ) : (
                    segment.value
                  ),
              )}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

export function UploadCard({
  value,
  onChange,
  compact = false,
}: {
  value: PendingUpload | null;
  onChange: (value: PendingUpload | null) => void;
  compact?: boolean;
}) {
  const colors = useColors();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pickFile() {
    setError(null);
    setLoading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ALLOWED_MIME_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      if (asset.mimeType && !ALLOWED_MIME_TYPES.includes(asset.mimeType)) {
        setError("Alege un fișier PDF, TXT, PNG sau JPG.");
        return;
      }
      if (asset.size && asset.size > MAX_FILE_SIZE) {
        setError("Fișierul depășește 10 MB. Alege unul mai mic.");
        return;
      }
      onChange({
        name: asset.name,
        uri: asset.uri,
        mimeType: asset.mimeType,
        size: asset.size,
        status: "selected",
      });
    } catch {
      setError(
        "Selectorul de fișiere nu este disponibil. Poți scrie enunțul direct.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <View
      style={[
        styles.uploadCard,
        { borderColor: colors.border, backgroundColor: colors.surface },
        compact && styles.uploadCompact,
      ]}
    >
      <View
        style={[styles.uploadIcon, { backgroundColor: `${colors.primary}16` }]}
      >
        <MaterialIcons name="attach-file" size={20} color={colors.primary} />
      </View>
      <View style={styles.uploadBody}>
        <Text style={[styles.uploadTitle, { color: colors.foreground }]}>
          {value ? value.name : "Atașează tema"}
        </Text>
        <Text style={[styles.uploadHint, { color: colors.muted }]}>
          {value
            ? "Gata de trimis · încă neanalizat"
            : "PDF, TXT, PNG, JPG · maximum 10 MB"}
        </Text>
        {error ? (
          <Text style={[styles.uploadError, { color: colors.error }]}>
            {error}
          </Text>
        ) : null}
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Elimină fișierul"
          onPress={() => onChange(null)}
        >
          <MaterialIcons name="close" size={21} color={colors.muted} />
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={pickFile}
          style={[styles.attachButton, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.attachText}>Alege</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  messageRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    marginBottom: 12,
  },
  messageRowUser: { justifyContent: "flex-end" },
  messageRail: { width: 3, borderRadius: 4, marginVertical: 5 },
  messageBubble: {
    maxWidth: "92%",
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 7,
  },
  messageMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  messageAuthor: { fontSize: 12, fontWeight: "800" },
  messageText: { fontSize: 14, lineHeight: 21 },
  messageHeading: { fontWeight: "800", marginTop: 2 },
  messageBullet: { paddingLeft: 4 },
  formula: {
    fontFamily: "serif",
    fontStyle: "italic",
    fontSize: 15,
    backgroundColor: "#8A72FF12",
    paddingHorizontal: 4,
  },
  uploadCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderRadius: 17,
    padding: 12,
  },
  uploadCompact: { padding: 10 },
  uploadIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  uploadBody: { flex: 1, gap: 3 },
  uploadTitle: { fontSize: 13, fontWeight: "800" },
  uploadHint: { fontSize: 11, lineHeight: 15 },
  uploadError: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  attachButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 11 },
  attachText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
});
