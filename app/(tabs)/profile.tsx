import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import {
  Badge,
  IconButton,
  ScreenHeader,
  SectionHeading,
  SurfaceCard,
} from "@/components/bionis-ui";
import { useColors } from "@/hooks/use-colors";
import { startOAuthLogin } from "@/constants/oauth";
import { SUBJECTS } from "@/lib/app-data";
import { ro } from "@/lib/i18n";
import type { Preferences } from "@/lib/storage";
import { useThemeContext } from "@/lib/theme-provider";
import { useAuth } from "@/hooks/use-auth";
import { useLearnerData } from "@/lib/learner-context";

export default function ProfileScreen() {
  const colors = useColors();
  const { colorScheme, setColorScheme } = useThemeContext();
  const { user, loading: authLoading, logout } = useAuth({ autoFetch: true });
  const {
    state: learnerState,
    syncStatus,
    updatePreferences: saveLearnerPreferences,
  } = useLearnerData();
  const preferences = learnerState.preferences;
  const [saved, setSaved] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [voice, setVoice] = useState(false);
  const [role, setRole] = useState<"Elev" | "Părinte">("Elev");
  const [avatarNotice, setAvatarNotice] = useState(false);
  const [premiumDetails, setPremiumDetails] = useState(false);
  function updatePreferences(patch: Partial<Preferences>) {
    saveLearnerPreferences(patch);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }
  function toggleSubject(id: string) {
    const next = preferences.preferredSubjects.includes(id)
      ? preferences.preferredSubjects.filter((subject) => subject !== id)
      : [...preferences.preferredSubjects, id];
    updatePreferences({ preferredSubjects: next });
  }
  return (
    <ScreenContainer safeAreaClassName="px-5">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.topBar}>
          <ScreenHeader
            eyebrow={ro.profileEyebrow}
            title={ro.profile}
            action={<IconButton icon="settings" label="Deschide setările" />}
          />
        </View>
        <SurfaceCard style={styles.profileCard}>
          <View
            style={[styles.avatar, { backgroundColor: `${colors.primary}20` }]}
          >
            <Text style={[styles.avatarText, { color: colors.primary }]}>
              {preferences.displayName.slice(0, 1).toUpperCase()}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Editează fotografia de profil"
              onPress={() => setAvatarNotice(true)}
              style={[styles.avatarEdit, { backgroundColor: colors.primary }]}
            >
              <MaterialIcons name="edit" size={12} color="#FFFFFF" />
            </Pressable>
          </View>
          <View style={styles.profileCopy}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>
              {preferences.displayName || "Elev"}
            </Text>
            <Text style={[styles.profileMeta, { color: colors.muted }]}>
              {user?.email ?? "Profil local de învățare"}
            </Text>
            <Badge tone={user ? colors.success : colors.warning}>
              {user ? "Sincronizat cu Manus" : ro.savedOnDevice}
            </Badge>
          </View>
        </SurfaceCard>
        {avatarNotice ? (
          <SurfaceCard style={styles.noticeCard}>
            <Text style={[styles.noticeText, { color: colors.muted }]}>
              Selectarea fotografiei de profil va folosi biblioteca
              dispozitivului după activarea permisiunii pentru imagini.
            </Text>
            <Pressable onPress={() => setAvatarNotice(false)}>
              <Text style={[styles.noticeAction, { color: colors.primary }]}>
                Am înțeles
              </Text>
            </Pressable>
          </SurfaceCard>
        ) : null}
        <SectionHeading title="Tipul de spațiu" />
        <SurfaceCard style={styles.formCard}>
          <View style={styles.optionWrap}>
            <Pressable
              onPress={() => setRole("Elev")}
              style={[
                styles.option,
                {
                  backgroundColor:
                    role === "Elev" ? `${colors.primary}16` : colors.background,
                  borderColor: role === "Elev" ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  { color: role === "Elev" ? colors.primary : colors.muted },
                ]}
              >
                Elev
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setRole("Părinte")}
              style={[
                styles.option,
                {
                  backgroundColor:
                    role === "Părinte"
                      ? `${colors.primary}16`
                      : colors.background,
                  borderColor:
                    role === "Părinte" ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  { color: role === "Părinte" ? colors.primary : colors.muted },
                ]}
              >
                Părinte
              </Text>
            </Pressable>
          </View>
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>
            NUME AFIȘAT
          </Text>
          <TextInput
            accessibilityLabel="Nume afișat"
            value={preferences.displayName}
            onChangeText={(displayName) => updatePreferences({ displayName })}
            placeholder="Elev"
            placeholderTextColor={colors.muted}
            style={[
              styles.nameInput,
              { color: colors.foreground, borderColor: colors.border },
            ]}
          />
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>
            CLASĂ / NIVEL
          </Text>
          <View style={styles.optionWrap}>
            {(
              [
                "La început",
                "Îmi formez încrederea",
                "Pregătit pentru examen",
              ] as Preferences["level"][]
            ).map((item) => (
              <Pressable
                key={item}
                onPress={() => updatePreferences({ level: item })}
                style={[
                  styles.option,
                  {
                    backgroundColor:
                      preferences.level === item
                        ? `${colors.primary}16`
                        : colors.background,
                    borderColor:
                      preferences.level === item
                        ? colors.primary
                        : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    {
                      color:
                        preferences.level === item
                          ? colors.primary
                          : colors.muted,
                    },
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text
            style={[styles.fieldLabel, { color: colors.muted, marginTop: 19 }]}
          >
            STIL DE EXPLICAȚIE
          </Text>
          <View style={styles.optionWrap}>
            {(
              [
                "Scurt și clar",
                "Detaliat și vizual",
                "Întrebări socratice",
              ] as Preferences["explanationStyle"][]
            ).map((item) => (
              <Pressable
                key={item}
                onPress={() => updatePreferences({ explanationStyle: item })}
                style={[
                  styles.option,
                  {
                    backgroundColor:
                      preferences.explanationStyle === item
                        ? `${colors.primary}16`
                        : colors.background,
                    borderColor:
                      preferences.explanationStyle === item
                        ? colors.primary
                        : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    {
                      color:
                        preferences.explanationStyle === item
                          ? colors.primary
                          : colors.muted,
                    },
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
        </SurfaceCard>
        <SectionHeading title="Materiile tale" />
        <SurfaceCard style={styles.subjectCard}>
          <Text style={[styles.subtleCopy, { color: colors.muted }]}>
            Elunariq folosește aceste alegeri pentru exemple și recomandări.
          </Text>
          <View style={styles.optionWrap}>
            {SUBJECTS.map((subject) => (
              <Pressable
                key={subject.id}
                onPress={() => toggleSubject(subject.id)}
                style={[
                  styles.subjectOption,
                  {
                    backgroundColor: preferences.preferredSubjects.includes(
                      subject.id,
                    )
                      ? `${subject.tint}16`
                      : colors.background,
                    borderColor: preferences.preferredSubjects.includes(
                      subject.id,
                    )
                      ? subject.tint
                      : colors.border,
                  },
                ]}
              >
                <MaterialIcons
                  name={subject.icon as never}
                  size={16}
                  color={
                    preferences.preferredSubjects.includes(subject.id)
                      ? subject.tint
                      : colors.muted
                  }
                />
                <Text
                  style={[
                    styles.optionText,
                    {
                      color: preferences.preferredSubjects.includes(subject.id)
                        ? subject.tint
                        : colors.muted,
                    },
                  ]}
                >
                  {subject.shortLabel}
                </Text>
                {preferences.preferredSubjects.includes(subject.id) ? (
                  <MaterialIcons name="check" size={15} color={subject.tint} />
                ) : null}
              </Pressable>
            ))}
          </View>
        </SurfaceCard>
        <SectionHeading title="Preferințe" />
        <SurfaceCard style={styles.settingsCard}>
          <SettingRow
            icon="dark-mode"
            title="Aspect"
            detail={
              colorScheme === "dark" ? "Temă întunecată" : "Temă luminoasă"
            }
          >
            <Switch
              accessibilityLabel="Schimbă tema"
              value={colorScheme === "dark"}
              onValueChange={(value) =>
                setColorScheme(value ? "dark" : "light")
              }
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </SettingRow>
          <SettingRow
            icon="record-voice-over"
            title="Comenzi vocale"
            detail={
              voice ? "Permisiune cerută la utilizare" : "Oprite implicit"
            }
          >
            <Switch
              accessibilityLabel="Activează comenzile vocale"
              value={voice}
              onValueChange={setVoice}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </SettingRow>
          <View
            style={[
              styles.storageNote,
              { backgroundColor: `${colors.warning}12` },
            ]}
          >
            <MaterialIcons
              name="lock-outline"
              size={16}
              color={colors.warning}
            />
            <Text style={[styles.storageText, { color: colors.muted }]}>
              Preferințele și progresul local sunt salvate pe acest dispozitiv.
              Nu stocăm parole în aplicație.
            </Text>
          </View>
        </SurfaceCard>
        <SectionHeading title="Elunariq Premium" />
        <SurfaceCard style={styles.premiumCard}>
          <View style={styles.premiumTop}>
            <View
              style={[
                styles.premiumIcon,
                { backgroundColor: `${colors.primary}18` },
              ]}
            >
              <MaterialIcons
                name="auto-awesome"
                size={18}
                color={colors.primary}
              />
            </View>
            <View style={styles.premiumCopy}>
              <Text style={[styles.premiumTitle, { color: colors.foreground }]}>
                Planul Premium
              </Text>
              <Text style={[styles.premiumSubtitle, { color: colors.muted }]}>
                Abonament propus pentru lansare
              </Text>
            </View>
            <Badge tone={colors.warning}>În pregătire</Badge>
          </View>
          <View style={styles.premiumPriceRow}>
            <Text style={[styles.premiumPrice, { color: colors.foreground }]}>
              49,99 lei
            </Text>
            <Text style={[styles.premiumUnit, { color: colors.muted }]}>
              / lună · preț propus
            </Text>
          </View>
          <Text style={[styles.premiumBody, { color: colors.muted }]}>
            Acces extins la tutor, fișe teoretice cu formule randate și
            recapitulări de învățare — beneficii propuse, încă neactivate prin
            billing.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: premiumDetails }}
            onPress={() => setPremiumDetails((value) => !value)}
            style={[styles.premiumAction, { borderColor: colors.border }]}
          >
            <Text style={[styles.premiumActionText, { color: colors.primary }]}>
              {premiumDetails
                ? "Ascunde detaliile"
                : "Detalii și disponibilitate"}
            </Text>
            <MaterialIcons
              name={premiumDetails ? "expand-less" : "expand-more"}
              size={18}
              color={colors.primary}
            />
          </Pressable>
          {premiumDetails ? (
            <View
              style={[
                styles.premiumDetails,
                { backgroundColor: `${colors.warning}12` },
              ]}
            >
              <Text style={[styles.premiumDetailText, { color: colors.muted }]}>
                Prima săptămână este menționată în documente între 9 și 19 lei;
                suma exactă nu este decisă. În această versiune nu se pot
                cumpăra abonamente și nu începe nicio perioadă de probă.
              </Text>
              <Text style={[styles.premiumDetailText, { color: colors.muted }]}>
                Plata va fi activată după alegerea platformei și conectarea
                facturării oficiale. Pentru elevii minori, fluxul de cumpărare
                trebuie proiectat pentru părinte.
              </Text>
            </View>
          ) : null}
        </SurfaceCard>
        <SectionHeading title="Cont" />
        <SurfaceCard style={styles.accountCard}>
          {authLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : user ? (
            <>
              <Text style={[styles.accountTitle, { color: colors.foreground }]}>
                Cont conectat
              </Text>
              <Text style={[styles.accountBody, { color: colors.muted }]}>
                {user.email ?? "Identitatea ta este conectată."}
              </Text>
              <Text style={[styles.accountBody, { color: colors.muted }]}>
                {syncStatus === "synced"
                  ? "Progres sincronizat cu contul."
                  : syncStatus === "syncing"
                    ? "Se sincronizează progresul și lecțiile…"
                    : "Progres salvat pe acest dispozitiv; sincronizarea contului nu este disponibilă acum."}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => logout()}
                style={[styles.logoutButton, { borderColor: colors.border }]}
              >
                <Text style={[styles.logoutText, { color: colors.error }]}>
                  Deconectează-te
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.accountTitle, { color: colors.foreground }]}>
                Creează-ți contul Elunariq
              </Text>
              <Text style={[styles.accountBody, { color: colors.muted }]}>
                Creează un cont sau conectează-te în siguranță. Lecțiile și
                progresul se vor lega de cont după autentificare.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={async () => {
                  try {
                    await startOAuthLogin();
                  } catch (error) {
                    console.error("[OAuth] Sign-in could not be started", error);
                    setAuthNotice(
                      "Nu s-a putut porni autentificarea prin serverul Render. Verifică dacă serverul și configurația OAuth sunt disponibile.",
                    );
                  }
                }}
                style={[
                  styles.oauthButton,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Text style={styles.oauthText}>Creează cont / Conectare</Text>
                <MaterialIcons name="arrow-forward" size={16} color="#FFFFFF" />
              </Pressable>
            </>
          )}
        </SurfaceCard>
        {authNotice ? (
          <View style={styles.authNotice}>
            <Text style={[styles.noticeText, { color: colors.muted }]}>
              {authNotice}
            </Text>
          </View>
        ) : null}
        {saved ? (
          <View style={styles.savedToast}>
            <MaterialIcons
              name="check-circle"
              size={17}
              color={colors.success}
            />
            <Text style={[styles.savedText, { color: colors.success }]}>
              Salvat pe acest dispozitiv
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}
function SettingRow({
  icon,
  title,
  detail,
  children,
}: {
  icon: string;
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={styles.settingRow}>
      <View
        style={[styles.settingIcon, { backgroundColor: `${colors.primary}15` }]}
      >
        <MaterialIcons name={icon as never} size={18} color={colors.primary} />
      </View>
      <View style={styles.settingCopy}>
        <Text style={[styles.settingTitle, { color: colors.foreground }]}>
          {title}
        </Text>
        <Text style={[styles.settingDetail, { color: colors.muted }]}>
          {detail}
        </Text>
      </View>
      {children}
    </View>
  );
}
const styles = StyleSheet.create({
  content: { paddingTop: 18, paddingBottom: 34 },
  topBar: { marginBottom: 0 },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 13,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  avatarText: { fontSize: 23, fontWeight: "900" },
  avatarEdit: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 23,
    height: 23,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  profileCopy: { flex: 1, gap: 5 },
  profileName: { fontSize: 19, fontWeight: "900" },
  profileMeta: { fontSize: 12 },
  noticeCard: { padding: 13, marginBottom: 17, gap: 8 },
  noticeText: { fontSize: 12, lineHeight: 17 },
  noticeAction: { fontSize: 12, fontWeight: "800" },
  formCard: { gap: 9, marginBottom: 27 },
  fieldLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1.15 },
  nameInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8,
  },
  optionWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  option: {
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  optionText: { fontSize: 11, fontWeight: "800" },
  subjectCard: { marginBottom: 27, gap: 12 },
  subtleCopy: { fontSize: 12, lineHeight: 18 },
  subjectOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  premiumCard: { gap: 11, marginBottom: 27 },
  premiumTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  premiumIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  premiumCopy: { flex: 1, gap: 3 },
  premiumTitle: { fontSize: 15, fontWeight: "900" },
  premiumSubtitle: { fontSize: 11 },
  premiumPriceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 5,
    marginTop: 3,
  },
  premiumPrice: { fontSize: 23, fontWeight: "900" },
  premiumUnit: { fontSize: 11 },
  premiumBody: { fontSize: 12, lineHeight: 18 },
  premiumAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    paddingTop: 9,
    marginTop: 2,
  },
  premiumActionText: { fontSize: 12, fontWeight: "800" },
  premiumDetails: { gap: 8, borderRadius: 11, padding: 11 },
  premiumDetailText: { fontSize: 11, lineHeight: 16 },
  settingsCard: { gap: 19, marginBottom: 27 },
  settingRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  settingIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  settingCopy: { flex: 1, gap: 3 },
  settingTitle: { fontSize: 13, fontWeight: "800" },
  settingDetail: { fontSize: 11 },
  storageNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 12,
    padding: 11,
  },
  storageText: { flex: 1, fontSize: 11, lineHeight: 16 },
  accountCard: { gap: 8 },
  accountTitle: { fontSize: 15, fontWeight: "800" },
  accountBody: { fontSize: 12, lineHeight: 18 },
  logoutButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 9,
    marginTop: 7,
  },
  logoutText: { fontSize: 12, fontWeight: "800" },
  oauthButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginTop: 7,
  },
  oauthText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  authNotice: { marginTop: 11 },
  savedToast: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 17,
  },
  savedText: { fontSize: 12, fontWeight: "800" },
});
