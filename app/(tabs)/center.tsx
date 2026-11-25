import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { Badge, ScreenHeader, SectionHeading, SurfaceCard } from "@/components/bionis-ui";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { SUBJECTS } from "@/lib/app-data";

const ACCEPTED_TYPES = ["application/pdf", "text/plain", "image/png", "image/jpeg"];
const MAX_FILE_SIZE = 8 * 1024 * 1024;

type SelectedMaterial = {
  name: string;
  uri: string;
  mimeType: string;
  size?: number;
};

type CenterMaterial = {
  id: number;
  title: string;
  subject: string | null;
  fileName: string;
  mimeType: string;
  createdAt: string;
};

type EducatorCenter = {
  id: number;
  name: string;
  status: "draft" | "active" | "suspended";
  studentJoinMode: "approval" | "automatic";
  applicationStatus: "pending" | "approved" | "rejected" | null;
  accessCodeExpiresAt: Date | null;
  students: { id: number; name: string | null }[];
  joinRequests: { id: number; studentId: number; studentName: string | null; createdAt: string }[];
  materials: CenterMaterial[];
};

type JoinableCenter = {
  id: number;
  name: string;
  studentJoinMode: "approval" | "automatic";
  requestStatus: "pending" | "approved" | "rejected" | null;
};

async function readFileAsBase64(uri: string): Promise<string> {
  if (Platform.OS !== "web") {
    return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  }
  const response = await fetch(uri);
  if (!response.ok) throw new Error("Fișierul nu a putut fi citit.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export default function CenterScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const workspace = trpc.education.mySpace.useQuery(undefined, {
    enabled: user?.accountType === "student" || user?.accountType === "educator",
    retry: false,
  });
  const requestMutation = trpc.education.requestCenterAccess.useMutation();
  const uploadMutation = trpc.education.uploadMaterial.useMutation();
  const codeMutation = trpc.education.createStudentAccessCode.useMutation();
  const joinMutation = trpc.education.joinCenter.useMutation();
  const studentJoinMutation = trpc.education.requestStudentJoin.useMutation();
  const joinModeMutation = trpc.education.setStudentJoinMode.useMutation();
  const reviewJoinMutation = trpc.education.reviewStudentJoinRequest.useMutation();
  const downloadMutation = trpc.education.downloadMaterial.useMutation();
  const [centerName, setCenterName] = useState("");
  const [contactEmail, setContactEmail] = useState(user?.email ?? "");
  const [applicationDetails, setApplicationDetails] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [centerSearch, setCenterSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState<SelectedMaterial | null>(null);
  const [materialTitle, setMaterialTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [notice, setNotice] = useState("");
  const [errorNotice, setErrorNotice] = useState(false);

  function showNotice(message: string, isError = false) {
    setNotice(message);
    setErrorNotice(isError);
  }

  async function submitApplication() {
    showNotice("");
    try {
      await requestMutation.mutateAsync({
        name: centerName,
        contactEmail,
        details: applicationDetails || undefined,
      });
      await workspace.refetch();
      showNotice("Cererea a fost trimisă. Spațiul se activează după aprobarea echipei.");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Cererea nu a putut fi trimisă.", true);
    }
  }

  async function pickMaterial() {
    showNotice("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ACCEPTED_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const extensionMime: Record<string, string> = {
        pdf: "application/pdf",
        txt: "text/plain",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
      };
      const fileExtension = asset.name.split(".").pop()?.toLowerCase() ?? "";
      const mimeType = asset.mimeType && ACCEPTED_TYPES.includes(asset.mimeType)
        ? asset.mimeType
        : extensionMime[fileExtension] ?? "";
      if (!ACCEPTED_TYPES.includes(mimeType)) {
        showNotice("Alege un fișier PDF, TXT, PNG sau JPG.", true);
        return;
      }
      if (asset.size !== undefined && asset.size > MAX_FILE_SIZE) {
        showNotice("Fișierul depășește limita de 8 MB.", true);
        return;
      }
      setSelectedFile({ name: asset.name, uri: asset.uri, mimeType, size: asset.size });
      setMaterialTitle(asset.name.replace(/\.[^.]+$/, ""));
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Fișierul nu a putut fi selectat.", true);
    }
  }

  async function uploadSelectedMaterial() {
    if (!selectedFile) return;
    showNotice("");
    try {
      const contentBase64 = await readFileAsBase64(selectedFile.uri);
      if (contentBase64.length > 11_200_000) {
        throw new Error("Fișierul depășește limita de 8 MB.");
      }
      await uploadMutation.mutateAsync({
        title: materialTitle,
        subject: subject || undefined,
        fileName: selectedFile.name,
        mimeType: selectedFile.mimeType as "application/pdf" | "text/plain" | "image/png" | "image/jpeg",
        contentBase64,
      });
      setSelectedFile(null);
      setMaterialTitle("");
      setSubject("");
      await workspace.refetch();
      showNotice("Materialul a fost încărcat în spațiul centrului.");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Materialul nu a putut fi încărcat.", true);
    }
  }

  async function createStudentCode() {
    showNotice("");
    try {
      const result = await codeMutation.mutateAsync();
      setAccessCode(result.code);
      await workspace.refetch();
      showNotice("Codul este valabil 30 de zile. Codurile anterioare au fost dezactivate.");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Codul nu a putut fi creat.", true);
    }
  }

  async function enrollInCenter() {
    showNotice("");
    try {
      const result = await joinMutation.mutateAsync({ code: joinCode });
      setJoinCode("");
      await workspace.refetch();
      showNotice(result.alreadyMember ? "Ești deja înscris în acest centru." : "Te-ai înscris în centrul educațional.");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Înscrierea nu a reușit.", true);
    }
  }

  async function requestStudentJoin(centerId: number) {
    showNotice("");
    try {
      const result = await studentJoinMutation.mutateAsync({ centerId });
      await workspace.refetch();
      showNotice(result.status === "joined"
        ? "Te-ai înscris în centrul educațional."
        : result.status === "member"
          ? "Ești deja înscris în acest centru."
          : "Cererea a fost trimisă și așteaptă aprobarea centrului.");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Cererea de înscriere nu a putut fi trimisă.", true);
    }
  }

  async function setStudentJoinMode(mode: "approval" | "automatic") {
    showNotice("");
    try {
      await joinModeMutation.mutateAsync({ mode });
      await workspace.refetch();
      showNotice(mode === "automatic"
        ? "Elevii se vor înscrie automat când solicită acces."
        : "Cererile elevilor vor necesita aprobarea ta.");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Setarea înscrierii nu a putut fi salvată.", true);
    }
  }

  async function reviewStudentJoinRequest(requestId: number, decision: "approved" | "rejected") {
    showNotice("");
    try {
      await reviewJoinMutation.mutateAsync({ requestId, decision });
      await workspace.refetch();
      showNotice(decision === "approved" ? "Elevul a fost acceptat în centru." : "Cererea elevului a fost respinsă.");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Cererea nu a putut fi analizată.", true);
    }
  }

  async function openMaterial(materialId: number) {
    showNotice("");
    try {
      const result = await downloadMutation.mutateAsync({ materialId });
      await Linking.openURL(result.url);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Materialul nu a putut fi deschis.", true);
    }
  }

  function openAccountCreation() {
    router.push({ pathname: "/profile", params: { accountType: "educator" } });
  }

  return (
    <ScreenContainer safeAreaClassName="px-5">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader eyebrow="ÎNVĂȚARE ÎN COMUNITATE" title="Spațiul centrului" />
        {!user ? (
          <SurfaceCard style={styles.card}>
            <MaterialIcons name="school" size={30} color={colors.primary} />
            <Text style={[styles.title, { color: colors.foreground }]}>Un spațiu pentru echipa ta</Text>
            <Text style={[styles.body, { color: colors.muted }]}>Creează un cont de reprezentant pentru a solicita accesul centrului. Cererile sunt verificate înainte ca materialele și elevii să fie conectați.</Text>
            <ActionButton label="Creează cont de centru" onPress={openAccountCreation} />
          </SurfaceCard>
        ) : user.accountType === "educator" ? (
          workspace.isLoading ? <ActivityIndicator color={colors.primary} /> : workspace.isError ? (
            <SurfaceCard style={styles.card}>
              <Text accessibilityRole="alert" style={[styles.body, { color: colors.error }]}>Spațiul nu a putut fi încărcat. Verifică serverul și încearcă din nou.</Text>
              <ActionButton label="Reîncearcă" onPress={() => void workspace.refetch()} />
            </SurfaceCard>
          ) : !workspace.data?.center ? (
            <SurfaceCard style={styles.card}>
              <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}15` }]}><MaterialIcons name="domain" size={22} color={colors.primary} /></View>
              <Text style={[styles.title, { color: colors.foreground }]}>Solicită acces pentru centru</Text>
              <Text style={[styles.body, { color: colors.muted }]}>Trimite datele instituției. După verificare, primești un spațiu privat în care poți încărca materiale și înscrie elevii.</Text>
              <TextInput value={centerName} onChangeText={setCenterName} placeholder="Numele școlii sau centrului" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
              <TextInput value={contactEmail} onChangeText={setContactEmail} placeholder="E-mail instituțional" placeholderTextColor={colors.muted} keyboardType="email-address" autoCapitalize="none" style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
              <TextInput value={applicationDetails} onChangeText={setApplicationDetails} placeholder="Descrie pe scurt activitatea și grupul de elevi (opțional)" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.multiline, { color: colors.foreground, borderColor: colors.border }]} />
              <ActionButton label={requestMutation.isPending ? "Se trimite cererea…" : "Trimite cererea"} disabled={requestMutation.isPending || centerName.trim().length < 2} onPress={() => void submitApplication()} />
            </SurfaceCard>
          ) : (
            <EducatorSpace
              center={workspace.data.center}
              colors={colors}
              centerName={centerName}
              contactEmail={contactEmail}
              applicationDetails={applicationDetails}
              accessCode={accessCode}
              joinModePending={joinModeMutation.isPending}
              reviewPending={reviewJoinMutation.isPending}
              selectedFile={selectedFile}
              materialTitle={materialTitle}
              subject={subject}
              uploadPending={uploadMutation.isPending}
              codePending={codeMutation.isPending}
              applicationPending={requestMutation.isPending}
              onCreateCode={() => void createStudentCode()}
              onJoinModeChange={(mode) => void setStudentJoinMode(mode)}
              onReviewJoinRequest={(id, decision) => void reviewStudentJoinRequest(id, decision)}
              onCenterNameChange={setCenterName}
              onContactEmailChange={setContactEmail}
              onApplicationDetailsChange={setApplicationDetails}
              onResubmit={() => void submitApplication()}
              onPickFile={() => void pickMaterial()}
              onClearFile={() => setSelectedFile(null)}
              onTitleChange={setMaterialTitle}
              onSubjectChange={setSubject}
              onUpload={() => void uploadSelectedMaterial()}
              onOpenMaterial={(id) => void openMaterial(id)}
            />
          )
        ) : user.accountType === "student" ? (
          workspace.isLoading ? <ActivityIndicator color={colors.primary} /> : workspace.isError ? (
            <SurfaceCard style={styles.card}>
              <Text accessibilityRole="alert" style={[styles.body, { color: colors.error }]}>Spațiul centrelor nu a putut fi încărcat. Verifică serverul și încearcă din nou.</Text>
              <ActionButton label="Reîncearcă" onPress={() => void workspace.refetch()} />
            </SurfaceCard>
          ) : (
            <StudentSpace
              centers={workspace.data?.kind === "student" ? workspace.data.centers : []}
              directory={workspace.data?.kind === "student" ? workspace.data.directory : []}
              colors={colors}
              joinCode={joinCode}
              centerSearch={centerSearch}
              joinPending={joinMutation.isPending}
              studentJoinPending={studentJoinMutation.isPending}
              onJoinCodeChange={setJoinCode}
              onCenterSearchChange={setCenterSearch}
              onJoin={() => void enrollInCenter()}
              onRequestJoin={(centerId) => void requestStudentJoin(centerId)}
              onOpenMaterial={(id) => void openMaterial(id)}
            />
          )
        ) : (
          <SurfaceCard style={styles.card}>
            <Text style={[styles.body, { color: colors.muted }]}>Conectează-te cu un cont de elev sau de reprezentant al unui centru pentru a folosi acest spațiu.</Text>
          </SurfaceCard>
        )}
        {notice ? <Text accessibilityRole="alert" style={[styles.notice, { color: errorNotice ? colors.error : colors.success }]}>{notice}</Text> : null}
      </ScrollView>
    </ScreenContainer>
  );
}

function EducatorSpace({
  center,
  colors,
  centerName,
  contactEmail,
  applicationDetails,
  accessCode,
  joinModePending,
  reviewPending,
  selectedFile,
  materialTitle,
  subject,
  uploadPending,
  codePending,
  applicationPending,
  onCreateCode,
  onJoinModeChange,
  onReviewJoinRequest,
  onCenterNameChange,
  onContactEmailChange,
  onApplicationDetailsChange,
  onResubmit,
  onPickFile,
  onClearFile,
  onTitleChange,
  onSubjectChange,
  onUpload,
  onOpenMaterial,
}: {
  center: EducatorCenter;
  colors: ReturnType<typeof useColors>;
  centerName: string;
  contactEmail: string;
  applicationDetails: string;
  accessCode: string;
  joinModePending: boolean;
  reviewPending: boolean;
  selectedFile: SelectedMaterial | null;
  materialTitle: string;
  subject: string;
  uploadPending: boolean;
  codePending: boolean;
  applicationPending: boolean;
  onCreateCode: () => void;
  onJoinModeChange: (mode: "approval" | "automatic") => void;
  onReviewJoinRequest: (id: number, decision: "approved" | "rejected") => void;
  onCenterNameChange: (value: string) => void;
  onContactEmailChange: (value: string) => void;
  onApplicationDetailsChange: (value: string) => void;
  onResubmit: () => void;
  onPickFile: () => void;
  onClearFile: () => void;
  onTitleChange: (value: string) => void;
  onSubjectChange: (value: string) => void;
  onUpload: () => void;
  onOpenMaterial: (id: number) => void;
}) {
  const active = center.status === "active";
  const statusLabel = center.applicationStatus === "rejected" ? "Cerere respinsă" : active ? "Centru activ" : "În verificare";
  const statusColor = center.applicationStatus === "rejected" ? colors.error : active ? colors.success : colors.warning;
  return (
    <>
      <SurfaceCard style={styles.card}>
        <View style={styles.centerHeader}>
          <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}15` }]}><MaterialIcons name="domain" size={22} color={colors.primary} /></View>
          <View style={styles.centerCopy}>
            <Text style={[styles.title, { color: colors.foreground }]}>{center.name}</Text>
            <Text style={[styles.body, { color: colors.muted }]}>{active ? `${center.students.length} elevi înscriși` : "Cererea este în așteptarea verificării echipei."}</Text>
          </View>
          <Badge tone={statusColor}>{statusLabel}</Badge>
        </View>
        {center.applicationStatus === "rejected" ? <Text style={[styles.body, { color: colors.error }]}>Cererea nu a fost aprobată. Actualizează datele și trimite-o din nou sau contactează echipa pentru clarificări.</Text> : null}
      </SurfaceCard>
      {center.applicationStatus === "rejected" ? (
        <SurfaceCard style={styles.card}>
          <TextInput value={centerName} onChangeText={onCenterNameChange} placeholder="Numele școlii sau centrului" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
          <TextInput value={contactEmail} onChangeText={onContactEmailChange} placeholder="E-mail instituțional" placeholderTextColor={colors.muted} keyboardType="email-address" autoCapitalize="none" style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
          <TextInput value={applicationDetails} onChangeText={onApplicationDetailsChange} placeholder="Detalii despre colaborare (opțional)" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.multiline, { color: colors.foreground, borderColor: colors.border }]} />
          <ActionButton label={applicationPending ? "Se retrimite cererea…" : "Retrimite cererea"} disabled={applicationPending || centerName.trim().length < 2 || !contactEmail.trim()} onPress={onResubmit} />
        </SurfaceCard>
      ) : null}
      {active ? (
        <>
          <SectionHeading title="Accesul elevilor" />
          <SurfaceCard style={styles.card}>
            <Text style={[styles.body, { color: colors.muted }]}>Generează codul și transmite-l elevilor. Codul este valabil 30 de zile; generarea unuia nou îl dezactivează pe cel anterior.</Text>
            <ActionButton label={codePending ? "Se generează…" : "Generează cod de înscriere"} disabled={codePending} onPress={onCreateCode} />
            {accessCode ? <Text selectable style={[styles.code, { color: colors.primary }]}>{accessCode}</Text> : null}
            {center.accessCodeExpiresAt ? <Text style={[styles.caption, { color: colors.muted }]}>Codul activ expiră la {new Date(center.accessCodeExpiresAt).toLocaleDateString("ro-RO")}.</Text> : null}
            <Text style={[styles.body, { color: colors.foreground }]}>Înscrierea prin solicitare</Text>
            <Text style={[styles.caption, { color: colors.muted }]}>Alege dacă solicitările din director sunt acceptate automat sau necesită aprobarea ta. Codurile rămân o înscriere directă.</Text>
            <View style={styles.actionRow}>
              <ModeButton label="Cu aprobare" selected={center.studentJoinMode === "approval"} disabled={joinModePending} onPress={() => onJoinModeChange("approval")} />
              <ModeButton label="Automat" selected={center.studentJoinMode === "automatic"} disabled={joinModePending} onPress={() => onJoinModeChange("automatic")} />
            </View>
            {center.joinRequests.length ? (
              <>
                <Text style={[styles.body, { color: colors.foreground }]}>Cereri de înscriere ({center.joinRequests.length})</Text>
                {center.studentJoinMode === "automatic"
                  ? <Text style={[styles.caption, { color: colors.muted }]}>Solicitările deja trimise rămân aici până le analizezi.</Text>
                  : null}
                {center.joinRequests.map((request) => (
                  <View key={request.id} style={[styles.requestRow, { borderColor: colors.border }]}>
                    <View style={styles.centerCopy}>
                      <Text style={[styles.body, { color: colors.foreground }]}>{request.studentName || "Elev"}</Text>
                      <Text style={[styles.caption, { color: colors.muted }]}>{new Date(request.createdAt).toLocaleDateString("ro-RO")}</Text>
                    </View>
                    <Pressable accessibilityRole="button" disabled={reviewPending} onPress={() => onReviewJoinRequest(request.id, "rejected")}>
                      <Text style={[styles.actionText, { color: colors.error }]}>Respinge</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" disabled={reviewPending} onPress={() => onReviewJoinRequest(request.id, "approved")}>
                      <Text style={[styles.actionText, { color: colors.primary }]}>Acceptă</Text>
                    </Pressable>
                  </View>
                ))}
              </>
            ) : null}
            {center.students.length ? center.students.map((student) => (
              <View key={student.id} style={[styles.studentRow, { borderColor: colors.border }]}>
                <MaterialIcons name="person-outline" size={18} color={colors.primary} />
                <Text style={[styles.body, { color: colors.foreground }]}>{student.name || "Elev"}</Text>
              </View>
            )) : <Text style={[styles.caption, { color: colors.muted }]}>Elevii înscriși vor apărea aici.</Text>}
          </SurfaceCard>
          <SectionHeading title="Materialele centrului" />
          <SurfaceCard style={styles.card}>
            <Text style={[styles.body, { color: colors.muted }]}>Încarcă fișe PDF, text sau imagini de până la 8 MB. Materialele sunt vizibile numai membrilor înscriși ai centrului.</Text>
            <Pressable accessibilityRole="button" onPress={onPickFile} style={[styles.fileButton, { borderColor: colors.border }]}>
              <MaterialIcons name="upload-file" size={19} color={colors.primary} />
              <Text style={[styles.actionText, { color: colors.primary }]}>{selectedFile?.name ?? "Alege materialul"}</Text>
            </Pressable>
            {selectedFile ? <>
              <TextInput value={materialTitle} onChangeText={onTitleChange} placeholder="Titlul materialului" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
              <TextInput value={subject} onChangeText={onSubjectChange} placeholder={`Materie (ex. ${SUBJECTS[0].shortLabel})`} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
              <View style={styles.actionRow}>
                <Pressable accessibilityRole="button" onPress={onClearFile}><Text style={[styles.actionText, { color: colors.muted }]}>Renunță</Text></Pressable>
                <ActionButton label={uploadPending ? "Se încarcă…" : "Încarcă materialul"} disabled={uploadPending || !materialTitle.trim()} onPress={onUpload} />
              </View>
            </> : null}
            {center.materials.length ? center.materials.map((material) => (
              <MaterialRow key={material.id} material={material} colors={colors} onPress={() => onOpenMaterial(material.id)} />
            )) : <Text style={[styles.caption, { color: colors.muted }]}>Materialele încărcate vor apărea aici.</Text>}
          </SurfaceCard>
        </>
      ) : null}
    </>
  );
}

function StudentSpace({
  centers,
  directory,
  colors,
  joinCode,
  centerSearch,
  joinPending,
  studentJoinPending,
  onJoinCodeChange,
  onCenterSearchChange,
  onJoin,
  onRequestJoin,
  onOpenMaterial,
}: {
  centers: { id: number; name: string; materials: CenterMaterial[] }[];
  directory: JoinableCenter[];
  colors: ReturnType<typeof useColors>;
  joinCode: string;
  centerSearch: string;
  joinPending: boolean;
  studentJoinPending: boolean;
  onJoinCodeChange: (value: string) => void;
  onCenterSearchChange: (value: string) => void;
  onJoin: () => void;
  onRequestJoin: (centerId: number) => void;
  onOpenMaterial: (id: number) => void;
}) {
  const matchingCenters = directory.filter((center) => center.name.toLocaleLowerCase("ro").includes(centerSearch.trim().toLocaleLowerCase("ro")));
  return (
    <>
      <SurfaceCard style={styles.card}>
        <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}15` }]}><MaterialIcons name="search" size={22} color={colors.primary} /></View>
        <Text style={[styles.title, { color: colors.foreground }]}>Găsește un centru</Text>
        <Text style={[styles.body, { color: colors.muted }]}>Caută centrul și solicită să te alături. Unele centre te acceptă automat, iar altele îți trimit cererea spre aprobare.</Text>
        <TextInput value={centerSearch} onChangeText={onCenterSearchChange} placeholder="Caută după numele centrului" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
        {matchingCenters.length ? matchingCenters.map((center) => (
          <View key={center.id} style={[styles.directoryRow, { borderColor: colors.border }]}>
            <View style={styles.centerCopy}>
              <Text style={[styles.body, { color: colors.foreground }]}>{center.name}</Text>
              <Text style={[styles.caption, { color: colors.muted }]}>
                {center.requestStatus === "pending"
                  ? "Cererea așteaptă aprobarea"
                  : center.requestStatus === "rejected"
                    ? "Cererea anterioară a fost respinsă"
                    : center.studentJoinMode === "automatic"
                      ? "Înscriere automată"
                      : "Necesită aprobarea centrului"}
              </Text>
            </View>
            <ActionButton
              label={center.requestStatus === "pending"
                ? "În așteptare"
                : center.studentJoinMode === "automatic"
                  ? center.requestStatus === "rejected" ? "Încearcă din nou" : "Alătură-te"
                  : center.requestStatus === "rejected" ? "Solicită din nou" : "Solicită acces"}
              disabled={studentJoinPending || center.requestStatus === "pending"}
              onPress={() => onRequestJoin(center.id)}
            />
          </View>
        )) : <Text style={[styles.caption, { color: colors.muted }]}>{directory.length ? "Nu am găsit centre cu acest nume." : "Nu există centre active disponibile momentan."}</Text>}
      </SurfaceCard>
      <SurfaceCard style={styles.card}>
        <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}15` }]}><MaterialIcons name="vpn-key" size={22} color={colors.primary} /></View>
        <Text style={[styles.title, { color: colors.foreground }]}>Intră în spațiul centrului</Text>
        <Text style={[styles.body, { color: colors.muted }]}>Introdu codul de înscriere primit de la profesor sau de la centrul educațional.</Text>
        <TextInput value={joinCode} onChangeText={(value) => onJoinCodeChange(value.toUpperCase().replace(/[^A-F0-9]/g, ""))} placeholder="Cod de 12 caractere" placeholderTextColor={colors.muted} autoCapitalize="characters" maxLength={12} style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
        <ActionButton label={joinPending ? "Se verifică…" : "Înscrie-mă"} disabled={joinPending || joinCode.length !== 12} onPress={onJoin} />
      </SurfaceCard>
      {centers.map((center) => (
        <View key={center.id} style={styles.centerSection}>
          <SectionHeading title={center.name} />
          <SurfaceCard style={styles.card}>
            {center.materials.length ? center.materials.map((material) => (
              <MaterialRow key={material.id} material={material} colors={colors} onPress={() => onOpenMaterial(material.id)} />
            )) : <Text style={[styles.caption, { color: colors.muted }]}>Centrul nu a încărcat încă materiale.</Text>}
          </SurfaceCard>
        </View>
      ))}
    </>
  );
}

function MaterialRow({
  material,
  colors,
  onPress,
}: {
  material: CenterMaterial;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.materialRow, { borderColor: colors.border }]}>
      <MaterialIcons name="description" size={20} color={colors.primary} />
      <View style={styles.centerCopy}>
        <Text style={[styles.materialTitle, { color: colors.foreground }]}>{material.title}</Text>
        <Text style={[styles.caption, { color: colors.muted }]}>{[material.subject, material.fileName].filter(Boolean).join(" · ")}</Text>
      </View>
      <MaterialIcons name="download" size={18} color={colors.muted} />
    </Pressable>
  );
}

function ActionButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.actionButton, { backgroundColor: colors.primary, opacity: disabled ? 0.55 : 1 }]}>
      <Text style={styles.actionButtonText}>{label}</Text>
    </Pressable>
  );
}

function ModeButton({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.modeButton,
        {
          backgroundColor: selected ? `${colors.primary}18` : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          opacity: disabled ? 0.55 : 1,
        },
      ]}
    >
      <Text style={[styles.actionText, { color: selected ? colors.primary : colors.muted }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 18, paddingBottom: 36, gap: 12 },
  card: { gap: 11 },
  title: { fontSize: 17, fontWeight: "800" },
  body: { fontSize: 12, lineHeight: 18 },
  caption: { fontSize: 11, lineHeight: 16 },
  iconWrap: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  multiline: { minHeight: 76, textAlignVertical: "top" },
  actionButton: { minHeight: 42, borderRadius: 12, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  actionButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  centerHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  centerCopy: { flex: 1, gap: 4 },
  fileButton: { minHeight: 42, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  actionText: { fontSize: 12, fontWeight: "800" },
  actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  code: { fontSize: 22, fontWeight: "900", letterSpacing: 3 },
  studentRow: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, paddingTop: 10 },
  requestRow: { flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, paddingTop: 10 },
  directoryRow: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, paddingTop: 10 },
  modeButton: { minHeight: 38, flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  materialRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, paddingTop: 10 },
  materialTitle: { fontSize: 13, fontWeight: "800" },
  centerSection: { gap: 2 },
  notice: { fontSize: 12, lineHeight: 18, paddingHorizontal: 3 },
});
