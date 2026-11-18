import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useColors } from "@/hooks/use-colors";
import type { PendingUpload } from "@/lib/storage";
import { formatLatexForDisplay, splitMathSegments } from "@/lib/math-format";
import type { TutorMessage } from "@/services/ai-service";
import { LearningDiagram } from "@/components/learning-diagram";
import { getApiBaseUrl } from "@/constants/api";

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
          assistant ? styles.messageBubbleAssistant : styles.messageBubbleUser,
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
        {assistant && message.analysis ? (
          <Text style={[styles.analysisMeta, { color: colors.muted }]}>
            {message.analysis.schoolLevel !== "necunoscut" ? `${message.analysis.schoolLevel} · ` : ""}
            {message.analysis.difficulty !== "necunoscut" ? `dificultate ${message.analysis.difficulty}` : ""}
            {message.analysis.mastery === "demonstrated" ? " · înțelegere demonstrată" : ""}
          </Text>
        ) : null}
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
                    /[\\{}]/.test(segment.value)
                      ? formatLatexForDisplay(segment.value)
                      : segment.value
                  ),
              )}
            </Text>
          );
        })}
        {assistant && message.imageUrl ? (
          <Image
            accessibilityLabel="Imagine educațională generată"
            source={{
              uri: /^https?:\/\//i.test(message.imageUrl)
                ? message.imageUrl
                : `${getApiBaseUrl()}${message.imageUrl}`,
            }}
            resizeMode="contain"
            style={styles.generatedImage}
          />
        ) : null}
        {assistant && message.imageError ? (
          <Text style={[styles.uploadError, { color: colors.error }]}>
            {message.imageError}
          </Text>
        ) : null}
        {assistant && message.diagram ? <LearningDiagram diagram={message.diagram} /> : null}
      </View>
    </View>
  );
}

export function UploadCard({
  value,
  onChange,
  multiple = false,
  selectedUploads = [],
  onUploadsChange,
  compact = false,
}: {
  value: PendingUpload | null;
  onChange: (value: PendingUpload | null) => void;
  multiple?: boolean;
  selectedUploads?: PendingUpload[];
  onUploadsChange?: (value: PendingUpload[]) => void;
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
        multiple,
      });
      if (result.canceled) return;
      const assets = result.assets ?? [];
      if (!assets.length) return;
      const extensionMime: Record<string, string> = { pdf: "application/pdf", txt: "text/plain", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };
      const accepted: PendingUpload[] = [];
      for (const asset of assets) {
        const mimeType = asset.mimeType ?? extensionMime[asset.name.split(".").pop()?.toLowerCase() ?? ""];
        if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType)) {
          setError("Unele fișiere nu sunt acceptate. Alege PDF, TXT, PNG sau JPG.");
          continue;
        }
        if (asset.size && asset.size > MAX_FILE_SIZE) {
          setError("Fișierele mai mari de 10 MB au fost omise.");
          continue;
        }
        accepted.push({
          name: asset.name,
          uri: asset.uri,
          mimeType,
          size: asset.size,
          status: "selected",
        });
      }
      if (multiple) {
        onUploadsChange?.([...selectedUploads, ...accepted]);
      } else if (accepted[0]) {
        onChange(accepted[0]);
      }
    } catch {
      setError(
        "Selectorul de fișiere nu este disponibil. Poți scrie enunțul direct.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function capturePhoto() {
    setError(null);
    if (Platform.OS !== "web") {
      setLoading(true);
      try {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError("Permite accesul la cameră din setările dispozitivului pentru a fotografia tema.");
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          quality: 0.85,
        });
        if (result.canceled) return;
        const asset = result.assets[0];
        if (!asset) return;
        const mimeType = asset.mimeType ?? "image/jpeg";
        if (!ALLOWED_MIME_TYPES.includes(mimeType) || !mimeType.startsWith("image/")) {
          setError("Alege o fotografie PNG sau JPG.");
          return;
        }
        if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
          setError("Fotografia depășește 10 MB. Alege una mai mică.");
          return;
        }
        const photo = {
          name: asset.fileName ?? "fotografie-tema.jpg",
          uri: asset.uri,
          mimeType,
          size: asset.fileSize,
          status: "selected",
        } satisfies PendingUpload;
        if (multiple) onUploadsChange?.([...selectedUploads, photo]);
        else onChange(photo);
      } catch {
        setError("Camera nu a putut fi pornită. Poți alege o fotografie existentă.");
      } finally {
        setLoading(false);
      }
      return;
    }
    if (typeof document === "undefined") return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = multiple;
    input.setAttribute("capture", "environment");
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      const accepted: PendingUpload[] = [];
      for (const file of files) {
        if (!ALLOWED_MIME_TYPES.includes(file.type) || !file.type.startsWith("image/")) {
          setError("Alege fotografii PNG sau JPG.");
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          setError("Fotografiile mai mari de 10 MB au fost omise.");
          continue;
        }
        accepted.push({
          name: file.name || "fotografie-tema.jpg",
          uri: URL.createObjectURL(file),
          mimeType: file.type,
          size: file.size,
          status: "selected",
        });
      }
      if (multiple) onUploadsChange?.([...selectedUploads, ...accepted]);
      else if (accepted[0]) onChange(accepted[0]);
    };
    input.click();
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
        style={[
          styles.uploadIcon,
          compact && styles.uploadIconCompact,
          { backgroundColor: `${colors.primary}16` },
        ]}
      >
        <MaterialIcons name="attach-file" size={20} color={colors.primary} />
      </View>
      <View style={styles.uploadBody}>
        <Text style={[styles.uploadTitle, { color: colors.foreground }]}>
          {multiple
            ? selectedUploads.length
              ? `${selectedUploads.length} fișiere atașate`
              : "Atașează tema"
            : value?.name ?? "Atașează tema"}
        </Text>
        <Text style={[styles.uploadHint, { color: colors.muted }]}>
          {multiple
            ? "Adaugă poze sau fișiere: maximum 10 MB per fișier și 30 MB per trimitere."
            : value
            ? "Atașat · va fi trimis tutorului la următorul mesaj"
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
      ) : value && !multiple ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Elimină fișierul"
          onPress={() => onChange(null)}
        >
          <MaterialIcons name="close" size={21} color={colors.muted} />
        </Pressable>
      ) : (
        <View style={styles.uploadActions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Fotografiază tema" onPress={capturePhoto} style={[styles.attachButton, { backgroundColor: colors.success }]}>
            <MaterialIcons name="photo-camera" size={16} color="#FFFFFF" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={multiple ? "Alege poze sau fișiere pentru temă" : "Alege poza sau fișierul temei"}
            onPress={pickFile}
            style={[styles.attachButton, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.attachText}>Alege</Text>
          </Pressable>
        </View>
      )}
      {multiple && selectedUploads.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.selectedUploads}
          contentContainerStyle={styles.selectedUploadsContent}
        >
          {selectedUploads.map((file, index) => (
            <Pressable
              key={`${file.uri}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={`Elimină ${file.name}`}
              onPress={() =>
                onUploadsChange?.(
                  selectedUploads.filter((_, fileIndex) => fileIndex !== index),
                )
              }
              style={[styles.selectedUpload, { backgroundColor: `${colors.primary}12` }]}
            >
              <Text numberOfLines={1} style={[styles.selectedUploadText, { color: colors.foreground }]}>
                {file.name}
              </Text>
              <MaterialIcons name="close" size={14} color={colors.muted} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
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
    maxWidth: "100%",
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    gap: 7,
  },
  messageBubbleAssistant: { flex: 1 },
  messageBubbleUser: { maxWidth: "94%" },
  messageMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  messageAuthor: { fontSize: 12, fontWeight: "800" },
  analysisMeta: { fontSize: 10, lineHeight: 14, textTransform: "capitalize" },
  messageText: { fontSize: 14, lineHeight: 21 },
  generatedImage: {
    width: "100%",
    height: 240,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    marginTop: 6,
  },
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
    flexWrap: "wrap",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderRadius: 17,
    padding: 12,
  },
  uploadCompact: { paddingHorizontal: 7, paddingVertical: 5, gap: 7 },
  selectedUploads: { flexBasis: "100%", maxHeight: 34 },
  selectedUploadsContent: { gap: 6, alignItems: "center" },
  selectedUpload: { maxWidth: 180, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 },
  selectedUploadText: { flexShrink: 1, fontSize: 10, fontWeight: "700" },
  uploadIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  uploadIconCompact: { width: 26, height: 26, borderRadius: 9 },
  uploadBody: { flex: 1, gap: 3 },
  uploadTitle: { fontSize: 13, fontWeight: "800" },
  uploadHint: { fontSize: 11, lineHeight: 15 },
  uploadError: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  attachButton: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9 },
  uploadActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  attachText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
});
