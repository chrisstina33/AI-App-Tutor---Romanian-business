import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
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
import { SUBJECTS } from "@/lib/app-data";
import { ro } from "@/lib/i18n";
import type { Preferences } from "@/lib/storage";
import { ACCENT_COLORS, useThemeContext } from "@/lib/theme-provider";
import { useLearnerData } from "@/lib/learner-context";
import { useAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { PREMIUM_MONTHLY_PRICE_LABEL } from "@/shared/billing";

export default function ProfileScreen() {
  const colors = useColors();
  const routeParams = useLocalSearchParams<{ billing?: string }>();
  const { colorScheme, setColorScheme, accent, setAccent } = useThemeContext();
  const { state: learnerState, updatePreferences: saveLearnerPreferences } = useLearnerData();
  const { user, beginSession, endSession } = useAuth();
  const preferences = learnerState.preferences;
  const [saved, setSaved] = useState(false);
  const [voice, setVoice] = useState(false);
  const [accountType, setAccountType] = useState<"student" | "parent">("student");
  const [authMode, setAuthMode] = useState<"signup" | "signin">("signup");
  const [accountName, setAccountName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [parentCode, setParentCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [accountNotice, setAccountNotice] = useState("");
  const [accountNoticeIsError, setAccountNoticeIsError] = useState(false);
  const [avatarNotice, setAvatarNotice] = useState(false);
  const [premiumDetails, setPremiumDetails] = useState(false);
  const [billingNotice, setBillingNotice] = useState("");
  const [showPartnership, setShowPartnership] = useState(false);
  const [schoolName, setSchoolName] = useState("");
  const [schoolEmail, setSchoolEmail] = useState("");
  const [schoolNotes, setSchoolNotes] = useState("");
  const [partnershipNotice, setPartnershipNotice] = useState("");
  const signUpMutation = trpc.auth.signUp.useMutation();
  const signInMutation = trpc.auth.signIn.useMutation();
  const signOutMutation = trpc.auth.signOut.useMutation();
  const inviteMutation = trpc.auth.createParentInvite.useMutation();
  const linkMutation = trpc.auth.linkStudent.useMutation();
  const parentOverview = trpc.auth.parentOverview.useQuery(undefined, { enabled: user?.accountType === "parent", retry: false, refetchInterval: 30_000 });
  const billingStatus = trpc.billing.status.useQuery(undefined, {
    enabled: Boolean(user),
    retry: false,
    refetchInterval: user ? 15_000 : false,
  });
  const checkoutMutation = trpc.billing.createCheckout.useMutation();
  const portalMutation = trpc.billing.createPortal.useMutation();
  useEffect(() => {
    if (routeParams.billing === "success") {
      setBillingNotice("Plata a fost procesată de Stripe. Reîmprospătez starea abonamentului.");
      void billingStatus.refetch();
    } else if (routeParams.billing === "cancel") {
      setBillingNotice("Plata a fost anulată; nu s-a activat un abonament.");
    }
  }, [routeParams.billing, billingStatus.refetch]);
  function showAccountNotice(message: string, isError = false) {
    setAccountNotice(message);
    setAccountNoticeIsError(isError);
  }
  async function submitAccount() {
    showAccountNotice("");
    try {
      const response = authMode === "signup"
        ? await signUpMutation.mutateAsync({ name: accountName || preferences.displayName, email: accountEmail, password: accountPassword, accountType })
        : await signInMutation.mutateAsync({ email: accountEmail, password: accountPassword });
      await beginSession(response.session.token, response.user);
      if (response.user.accountType === "student" && authMode === "signup") updatePreferences({ displayName: response.user.name });
      showAccountNotice("Contul este activ. Progresul elevului se sincronizează cu serverul.");
      setAccountPassword("");
    } catch (error) { showAccountNotice(error instanceof Error ? error.message : "Autentificarea nu a reușit.", true); }
  }
  async function createInvite() {
    try { const result = await inviteMutation.mutateAsync(); setParentCode(result.code); showAccountNotice("Cod valabil 30 de minute. Trimite-l părintelui pentru asociere."); }
    catch (error) { showAccountNotice(error instanceof Error ? error.message : "Codul nu a putut fi creat.", true); }
  }
  async function connectStudent() {
    try { await linkMutation.mutateAsync({ code: inviteCode }); setInviteCode(""); await parentOverview.refetch(); showAccountNotice("Contul elevului a fost asociat."); }
    catch (error) { showAccountNotice(error instanceof Error ? error.message : "Asocierea nu a reușit.", true); }
  }
  async function startCheckout() {
    try {
      const session = await checkoutMutation.mutateAsync();
      await Linking.openURL(session.url);
      setBillingNotice("Se deschide pagina securizată Stripe pentru confirmarea plății.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Checkout-ul nu a putut fi deschis.";
      setBillingNotice(message);
      showAccountNotice(message, true);
    }
  }
  async function manageSubscription() {
    try {
      const session = await portalMutation.mutateAsync();
      await Linking.openURL(session.url);
      setBillingNotice("Se deschide portalul securizat pentru administrarea abonamentului.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Administrarea abonamentului nu a putut fi deschisă.";
      setBillingNotice(message);
      showAccountNotice(message, true);
    }
  }
  async function signOut() {
    try { await signOutMutation.mutateAsync(); } catch { /* Expired sessions can still be cleared locally. */ }
    await endSession();
    showAccountNotice("Ai ieșit din cont.");
  }
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
  async function sendPartnershipRequest() {
    const contactAddress = process.env.EXPO_PUBLIC_PARTNERSHIPS_EMAIL;
    if (!schoolName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(schoolEmail.trim())) {
      const message = "Completează numele instituției și o adresă de e-mail validă.";
      setPartnershipNotice(message);
      setAccountNotice(message);
      setAccountNoticeIsError(true);
      return;
    }
    if (!contactAddress || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactAddress)) {
      const message = "Formularul nu poate trimite solicitarea: configurează EXPO_PUBLIC_PARTNERSHIPS_EMAIL cu adresa oficială de contact.";
      setPartnershipNotice(message);
      setAccountNotice(message);
      setAccountNoticeIsError(true);
      return;
    }
    const subject = "Solicitare colaborare educațională";
    const body = [
      `Instituție: ${schoolName.trim()}`,
      `E-mail de contact: ${schoolEmail.trim()}`,
      schoolNotes.trim() ? `Detalii: ${schoolNotes.trim()}` : "",
    ].filter(Boolean).join("\n");
    try {
      await Linking.openURL(`mailto:${contactAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
      setShowPartnership(false);
      setPartnershipNotice("");
      setAccountNotice("Solicitarea a fost pregătită în aplicația de e-mail. Trimite mesajul pentru a o transmite.");
      setAccountNoticeIsError(false);
    } catch (error) {
      const message = error instanceof Error ? `Aplicația de e-mail nu s-a putut deschide: ${error.message}` : "Aplicația de e-mail nu s-a putut deschide.";
      setPartnershipNotice(message);
      setAccountNotice(message);
      setAccountNoticeIsError(true);
    }
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
              {user ? (user.accountType === "student" ? "Profil sincronizat pentru elev" : "Cont de părinte conectat") : "Profil local de învățare"}
            </Text>
            <Badge tone={user ? colors.success : colors.warning}>{user ? "Cont conectat" : ro.savedOnDevice}</Badge>
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
        <SectionHeading title={user ? "Cont conectat" : "Profil de învățare"} />
        <SurfaceCard style={styles.formCard}>
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
            CLASA TA (OPȚIONAL)
          </Text>
          <View style={styles.optionWrap}>
            {(
              [
                "Nu o precizez",
                "Clasa a V-a",
                "Clasa a VI-a",
                "Clasa a VII-a",
                "Clasa a VIII-a",
                "Clasa a IX-a",
                "Clasa a X-a",
                "Clasa a XI-a",
                "Clasa a XII-a",
              ] as Preferences["schoolGrade"][]
            ).map((item) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected: preferences.schoolGrade === item }}
                onPress={() => updatePreferences({ schoolGrade: item })}
                style={[
                  styles.option,
                  {
                    backgroundColor:
                      preferences.schoolGrade === item
                        ? `${colors.primary}16`
                        : colors.background,
                    borderColor:
                      preferences.schoolGrade === item
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
                        preferences.schoolGrade === item
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
          <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 10 }]}>
            NIVELUL TĂU DE ÎNVĂȚARE
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
        <SectionHeading title="Ghid personalizat" />
        <SurfaceCard style={styles.subjectCard}>
          <Text style={[styles.subtleCopy, { color: colors.muted }]}>
            Mini-diagnosticul salvează clasa, nivelul, materiile prioritare și răspunsurile pe acest dispozitiv; pentru conturile de elev, datele se sincronizează cu serverul.
          </Text>
          <Text style={[styles.accountBody, { color: colors.foreground }]}>
            {preferences.diagnosticSubject
              ? `Materie de pornire: ${preferences.diagnosticSubject} · ${preferences.schoolGrade} · ${preferences.level}`
              : "Completează câteva întrebări scurte pentru a calibra recomandările."}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/tutor", params: { setup: "1" } })}
            style={[styles.premiumAction, { borderColor: colors.primary }]}
          >
            <Text style={[styles.premiumActionText, { color: colors.primary }]}>
              {preferences.tutorSetupComplete ? "Refă mini-diagnosticul" : "Începe mini-diagnosticul"}
            </Text>
            <MaterialIcons name="arrow-forward" size={17} color={colors.primary} />
          </Pressable>
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
          <View>
            <Text style={[styles.settingTitle, { color: colors.foreground, marginBottom: 10 }]}>Culoare de accent</Text>
            <View style={styles.optionWrap}>
              {([{ id: "violet", label: "Violet" }, { id: "teal", label: "Verde petrol" }, { id: "coral", label: "Teracotă" }] as const).map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Alege accent ${item.label}`} accessibilityState={{ selected: accent === item.id }} onPress={() => setAccent(item.id)} style={[styles.accentOption, { borderColor: accent === item.id ? ACCENT_COLORS[item.id] : colors.border }]}><View style={[styles.accentDot, { backgroundColor: ACCENT_COLORS[item.id] }]} /><Text style={[styles.optionText, { color: colors.foreground }]}>{item.label}</Text></Pressable>)}
            </View>
          </View>
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
              {user ? "Progresul elevului este sincronizat cu serverul, iar copia locală rămâne disponibilă pe dispozitiv." : "Preferințele și progresul sunt salvate pe acest dispozitiv până când conectezi un cont."}
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
                Abonament lunar · pilot web
              </Text>
            </View>
            <Badge tone={billingStatus.data?.active ? colors.success : colors.warning}>
              {user && billingStatus.isPending ? "Se verifică" : billingStatus.isError && user ? "Indisponibil" : billingStatus.data?.active ? "Activ" : "Plan pilot"}
            </Badge>
          </View>
          <View style={styles.premiumPriceRow}>
            <Text style={[styles.premiumPrice, { color: colors.foreground }]}>
              {PREMIUM_MONTHLY_PRICE_LABEL}
            </Text>
            <Text style={[styles.premiumUnit, { color: colors.muted }]}>
              / lună
            </Text>
          </View>
          <Text style={[styles.premiumBody, { color: colors.muted }]}>
            Acces la explicații complexe și resurse vizuale pentru un elev.
            Abonamentul lunar se plătește cu cardul pe web; contul elevului
            trebuie asociat contului părintelui.
          </Text>
          {billingStatus.isPending && user ? (
            <View style={styles.billingStatusRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.premiumDetailText, { color: colors.muted }]}>Se verifică starea abonamentului…</Text>
            </View>
          ) : null}
          {billingStatus.isError && user ? (
            <Text accessibilityRole="alert" style={[styles.premiumDetailText, { color: colors.error }]}>
              Starea abonamentului nu a putut fi verificată. Verifică API-ul, baza de date și încearcă din nou.
            </Text>
          ) : null}
          {billingNotice ? (
            <Text accessibilityRole="alert" style={[styles.premiumDetailText, { color: billingNotice.includes("anulată") ? colors.muted : billingNotice.includes("nu") || billingNotice.includes("configurat") ? colors.error : colors.success }]}>
              {billingNotice}
            </Text>
          ) : null}
          {billingStatus.data?.active ? (
            <>
              <Text style={[styles.premiumDetailText, { color: colors.success }]}>
                Abonament activ{billingStatus.data.currentPeriodEnd
                  ? ` până la ${new Date(billingStatus.data.currentPeriodEnd).toLocaleDateString("ro-RO")}`
                  : ""}.
              </Text>
              {user?.accountType === "parent" && Platform.OS === "web" ? (
                <Pressable onPress={manageSubscription} disabled={portalMutation.isPending} style={[styles.premiumAction, { borderColor: colors.border, opacity: portalMutation.isPending ? 0.6 : 1 }]}>
                  <Text style={[styles.premiumActionText, { color: colors.primary }]}>{portalMutation.isPending ? "Se deschide portalul…" : "Administrează abonamentul"}</Text>
                </Pressable>
              ) : null}
            </>
          ) : user?.accountType === "parent" && Platform.OS === "web" ? (
            parentOverview.isLoading ? (
              <Text style={[styles.premiumDetailText, { color: colors.muted }]}>Se verifică asocierea elevului…</Text>
            ) : parentOverview.isError ? (
              <Text accessibilityRole="alert" style={[styles.premiumDetailText, { color: colors.error }]}>Nu am putut verifica elevul asociat. Reîncarcă profilul și încearcă din nou.</Text>
            ) : (parentOverview.data?.length ?? 0) === 1 ? (
              <Pressable onPress={startCheckout} disabled={checkoutMutation.isPending} style={[styles.premiumAction, { borderColor: colors.primary, backgroundColor: `${colors.primary}12`, opacity: checkoutMutation.isPending ? 0.6 : 1 }]}>
                <Text style={[styles.premiumActionText, { color: colors.primary }]}>
                  {checkoutMutation.isPending ? "Se deschide plata..." : "Continuă la plata cu cardul"}
                </Text>
              </Pressable>
            ) : (
              <Text style={[styles.premiumDetailText, { color: colors.muted }]}>
                {(parentOverview.data?.length ?? 0) === 0
                  ? "Asociază mai întâi un singur cont de elev."
                  : "Planul de pilot acoperă un singur elev; abonamentele pentru mai mulți elevi sunt încă în pregătire."}
              </Text>
            )
          ) : user?.accountType === "parent" ? (
            <Text style={[styles.premiumDetailText, { color: colors.muted }]}>
              Plata cu cardul este disponibilă în versiunea web a pilotului.
            </Text>
          ) : user?.accountType === "student" ? (
            <Text style={[styles.premiumDetailText, { color: colors.muted }]}>
              Plata cu cardul este gestionată de părinte. Asociază contul părintelui pentru acces Premium.
            </Text>
          ) : (
            <Text style={[styles.premiumDetailText, { color: colors.muted }]}>
              Creează un cont de părinte și asociază un elev pentru a cumpăra abonamentul.
            </Text>
          )}
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
                Nu există perioadă de probă. Plata recurentă este de{" "}
                {PREMIUM_MONTHLY_PRICE_LABEL} pe lună și poate fi administrată
                sau anulată din portalul de facturare.
              </Text>
              <Text style={[styles.premiumDetailText, { color: colors.muted }]}>
                Planul pentru centre educaționale este în pregătire; nu se
                activează checkout sau acces de centru până la definirea
                locurilor și a facturării.
              </Text>
            </View>
          ) : null}
        </SurfaceCard>
        <SectionHeading title={user?.accountType === "parent" ? "Asociere elev–părinte și progres" : user?.accountType === "student" ? "Legătura cu părintele" : "Cont și asociere elev–părinte"} />
        <SurfaceCard style={styles.accountCard}>
          {user ? <>
            <Text style={[styles.accountTitle, { color: colors.foreground }]}>{user.accountType === "student" ? "Cont de elev" : "Cont de părinte"}</Text>
            <Text style={[styles.accountBody, { color: colors.muted }]}>{user.name} · {user.email}</Text>
            {user.accountType === "student" ? <>
              <Text style={[styles.accountBody, { color: colors.muted, marginTop: 8 }]}>Pași: 1. Părintele își creează un cont de tip „Părinte”. 2. Generezi codul de mai jos, valabil 30 de minute. 3. Părintele intră în Profil → Asociere elev–părinte și introduce codul; apoi poate vedea progresul sincronizat.</Text>
              <Pressable disabled={inviteMutation.isPending} onPress={createInvite} style={[styles.premiumAction, { borderColor: colors.border, marginTop: 12, opacity: inviteMutation.isPending ? 0.6 : 1 }]}><Text style={[styles.premiumActionText, { color: colors.primary }]}>{inviteMutation.isPending ? "Se generează codul…" : "Creează cod pentru părinte"}</Text></Pressable>
              {parentCode ? <Text selectable style={[styles.accountTitle, { color: colors.primary, marginTop: 10, letterSpacing: 2 }]}>{parentCode}</Text> : null}
            </> : <>
              <Text style={[styles.accountBody, { color: colors.muted, marginTop: 8 }]}>Solicită elevului un cod temporar din Profilul său. Introdu codul aici; după asociere, progresul elevului apare în această secțiune.</Text>
              <TextInput value={inviteCode} onChangeText={setInviteCode} placeholder="Cod primit de la elev" placeholderTextColor={colors.muted} autoCapitalize="characters" maxLength={16} style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, marginTop: 12 }]} />
              <Pressable disabled={linkMutation.isPending || inviteCode.trim().length !== 16} onPress={connectStudent} style={[styles.premiumAction, { borderColor: colors.border, marginTop: 8, opacity: linkMutation.isPending || inviteCode.trim().length !== 16 ? 0.6 : 1 }]}><Text style={[styles.premiumActionText, { color: colors.primary }]}>{linkMutation.isPending ? "Se asociază…" : "Asociază elevul"}</Text></Pressable>
              {parentOverview.isLoading ? <Text style={[styles.accountBody, { color: colors.muted }]}>Se încarcă progresul asociat…</Text> : null}
              {parentOverview.isError ? <Text accessibilityRole="alert" style={[styles.accountBody, { color: colors.error }]}>Progresul nu a putut fi încărcat. Verifică serverul și încearcă din nou.</Text> : null}
              {(parentOverview.data ?? []).map((student) => <View key={student.studentId} style={[styles.parentStudent, { borderColor: colors.border }]}>
                <Text style={[styles.accountTitle, { color: colors.foreground }]}>{student.name}</Text>
                <Text style={[styles.accountBody, { color: colors.muted }]}>{student.questionsAsked} întrebări · {student.lessons.length} materii/lecții urmărite</Text>
                {student.lessons.slice(0, 5).map((lesson) => <Text key={lesson.id} style={[styles.accountBody, { color: colors.muted, marginTop: 4 }]}>• {lesson.title} ({lesson.questionCount} întrebări)</Text>)}
              </View>)}
            </>}
            <Pressable onPress={signOut} style={[styles.premiumAction, { borderColor: colors.border, marginTop: 12 }]}><Text style={[styles.premiumActionText, { color: colors.error }]}>Deconectează-te</Text></Pressable>
          </> : <>
            <Text style={[styles.accountTitle, { color: colors.foreground }]}>{authMode === "signup" ? "Creează un cont" : "Intră în cont"}</Text>
            {authMode === "signup" ? <>
              <Text style={[styles.accountBody, { color: colors.muted, marginTop: 5 }]}>Alege tipul contului</Text>
              <View style={styles.optionWrap}>
                {([{ id: "student", label: "Elev" }, { id: "parent", label: "Părinte" }] as const).map((item) => <Pressable key={item.id} onPress={() => setAccountType(item.id)} style={[styles.option, { backgroundColor: accountType === item.id ? `${colors.primary}16` : colors.background, borderColor: accountType === item.id ? colors.primary : colors.border }]}><Text style={[styles.optionText, { color: accountType === item.id ? colors.primary : colors.muted }]}>{item.label}</Text></Pressable>)}
              </View>
              <TextInput value={accountName} onChangeText={setAccountName} placeholder="Nume afișat" placeholderTextColor={colors.muted} autoComplete="name" style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border }]} />
            </> : null}
            <TextInput value={accountEmail} onChangeText={setAccountEmail} placeholder="Adresă de e-mail" placeholderTextColor={colors.muted} keyboardType="email-address" autoCapitalize="none" autoComplete="email" style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, marginTop: 10 }]} />
            <TextInput value={accountPassword} onChangeText={setAccountPassword} placeholder={authMode === "signup" ? "Parolă (minimum 10 caractere)" : "Parolă"} placeholderTextColor={colors.muted} secureTextEntry autoComplete={authMode === "signup" ? "new-password" : "current-password"} style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, marginTop: 10 }]} />
            <Pressable onPress={submitAccount} disabled={signUpMutation.isPending || signInMutation.isPending} style={[styles.premiumAction, { borderColor: colors.primary, backgroundColor: `${colors.primary}12`, marginTop: 12 }]}><Text style={[styles.premiumActionText, { color: colors.primary }]}>{authMode === "signup" ? "Creează contul" : "Autentificare"}</Text></Pressable>
            <Pressable onPress={() => setAuthMode((value) => value === "signup" ? "signin" : "signup")} style={{ paddingVertical: 12 }}><Text style={[styles.premiumActionText, { color: colors.primary }]}>{authMode === "signup" ? "Am deja un cont" : "Creează un cont nou"}</Text></Pressable>
            <Text style={[styles.accountBody, { color: colors.muted }]}>Conturile au nevoie de server cu baza de date configurată. Pentru elevi minori, creați asocierea cu părintele înainte de pilot.</Text>
          </>}
          {accountNotice ? <Text accessibilityRole="alert" style={[styles.accountBody, { color: accountNoticeIsError ? colors.error : colors.success, marginTop: 10 }]}>{accountNotice}</Text> : null}
        </SurfaceCard>
        <SectionHeading title="Colaborări cu școli și centre" />
        <SurfaceCard style={styles.accountCard}>
          <Text style={[styles.accountBody, { color: colors.muted }]}>
            Discutăm parteneriate instituționale, programe pilot și coduri de acces pentru clase sau ateliere. Trimite o solicitare cu datele instituției și echipa revine prin e-mail.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setShowPartnership(true)} style={[styles.premiumAction, { borderColor: colors.primary }]}>
            <Text style={[styles.premiumActionText, { color: colors.primary }]}>Solicită o colaborare</Text>
            <MaterialIcons name="mail-outline" size={18} color={colors.primary} />
          </Pressable>
        </SurfaceCard>
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
      <Modal visible={showPartnership} transparent animationType="fade" onRequestClose={() => setShowPartnership(false)}>
        <View style={styles.partnershipBackdrop}>
          <View style={[styles.partnershipCard, { backgroundColor: colors.background }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.partnershipHeader}>
                <Text style={[styles.accountTitle, { color: colors.foreground }]}>Colaborare educațională</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Închide formularul" onPress={() => setShowPartnership(false)} hitSlop={8}>
                  <MaterialIcons name="close" size={22} color={colors.muted} />
                </Pressable>
              </View>
              <Text style={[styles.accountBody, { color: colors.muted }]}>Solicită detalii despre un program pilot sau coduri pentru o clasă ori un atelier.</Text>
              <TextInput accessibilityLabel="Numele școlii sau centrului" value={schoolName} onChangeText={setSchoolName} placeholder="Școală / centru educațional" placeholderTextColor={colors.muted} style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, marginTop: 10 }]} />
              <TextInput accessibilityLabel="E-mail de contact" value={schoolEmail} onChangeText={setSchoolEmail} placeholder="E-mail de contact" placeholderTextColor={colors.muted} keyboardType="email-address" autoCapitalize="none" style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border }]} />
              <TextInput accessibilityLabel="Detalii despre colaborare" value={schoolNotes} onChangeText={setSchoolNotes} placeholder="Tipul colaborării (opțional)" placeholderTextColor={colors.muted} multiline style={[styles.nameInput, styles.partnershipNotes, { color: colors.foreground, borderColor: colors.border }]} />
              {!process.env.EXPO_PUBLIC_PARTNERSHIPS_EMAIL ? (
                <Text style={[styles.premiumDetailText, { color: colors.warning }]}>Trimiterea necesită configurarea adresei publice EXPO_PUBLIC_PARTNERSHIPS_EMAIL.</Text>
              ) : null}
              {partnershipNotice ? <Text accessibilityRole="alert" style={[styles.premiumDetailText, { color: colors.error }]}>{partnershipNotice}</Text> : null}
              <Pressable accessibilityRole="button" onPress={() => void sendPartnershipRequest()} style={[styles.partnershipSend, { backgroundColor: colors.primary }]}>
                <Text style={styles.partnershipSendText}>Pregătește solicitarea prin e-mail</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  accentOption: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9 },
  accentDot: { width: 15, height: 15, borderRadius: 8 },
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
  billingStatusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
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
  parentStudent: { borderTopWidth: 1, marginTop: 14, paddingTop: 12 },
  accountTitle: { fontSize: 15, fontWeight: "800" },
  accountBody: { fontSize: 12, lineHeight: 18 },
  partnershipBackdrop: { flex: 1, justifyContent: "center", alignItems: "center", padding: 18, backgroundColor: "rgba(20, 20, 40, 0.56)" },
  partnershipCard: { width: "100%", maxWidth: 520, maxHeight: "90%", borderRadius: 20, padding: 18 },
  partnershipHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 },
  partnershipNotes: { minHeight: 76, textAlignVertical: "top" },
  partnershipSend: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 12, marginTop: 6, paddingHorizontal: 10 },
  partnershipSendText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900", textAlign: "center" },
  savedToast: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 17,
  },
  savedText: { fontSize: 12, fontWeight: "800" },
});
