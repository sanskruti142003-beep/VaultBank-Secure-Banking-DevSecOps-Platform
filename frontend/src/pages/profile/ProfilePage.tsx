import { useEffect, useState } from "react";
import {
  Bell,
  Camera,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Download,
  FileText,
  Home,
  Lock,
  Mail,
  Monitor,
  Pencil,
  ShieldCheck,
  Smartphone,
  Trash2,
  User,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { ActionDialog } from "@/components/common/ActionDialog";
import {
  DashboardCard,
  IconTile,
  StatusPill,
} from "@/components/dashboard/DashboardCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccounts } from "@/hooks/useAccounts";
import { useAuth } from "@/hooks/useAuth";
import { formatDate, kycTone, titleCase } from "@/lib/dashboard-format";
import {
  kycIdentityStatus,
  updateKycSubmission,
  useKycSubmission,
  type KycAsset,
} from "@/lib/kyc-store";
import { cn, customerDisplayId } from "@/lib/utils";
import { passwordRules } from "@/lib/validations/auth.schemas";
import { KycStatus } from "@/types/accounts.types";

function initials(name: string | undefined): string {
  return (name ?? "VB")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function SettingsRow({
  icon,
  tone,
  title,
  helper,
  onClick,
}: {
  icon: Parameters<typeof IconTile>[0]["icon"];
  tone: Parameters<typeof IconTile>[0]["tone"];
  title: string;
  helper: string;
  onClick?: () => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-4 border-b border-slate-100 py-5 text-left last:border-b-0"
      onClick={onClick}
      type="button"
    >
      <IconTile icon={icon} tone={tone} />
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-secondary">{title}</span>
        <span className="mt-1 block text-sm text-muted">{helper}</span>
      </span>
      <ChevronRight className="h-5 w-5 text-muted" />
    </button>
  );
}

function documentStatusText(status: KycStatus, uploaded: boolean) {
  if (!uploaded) {
    return "Not uploaded";
  }
  if (status === KycStatus.APPROVED) {
    return "Verified by admin";
  }
  if (status === KycStatus.REJECTED) {
    return "Rejected by admin";
  }
  return "Pending admin verification";
}

function KycDocumentTile({
  asset,
  label,
  status,
  onDelete,
  onOpen,
}: {
  asset?: KycAsset;
  label: string;
  status: KycStatus;
  onDelete?: () => void;
  onOpen?: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconTile
            className="h-10 w-10 rounded-lg"
            icon={label.toLowerCase().includes("selfie") ? Camera : FileText}
            tone={asset ? kycTone(status) : "slate"}
          />
          <div className="min-w-0">
            <p className="truncate font-semibold text-secondary">{label}</p>
            <p className="text-sm text-muted">{documentStatusText(status, Boolean(asset))}</p>
          </div>
        </div>
        <StatusPill tone={asset ? kycTone(status) : "slate"}>
          {asset ? titleCase(status) : "Missing"}
        </StatusPill>
      </div>
      {asset ? (
        <>
          <button
            className="mt-4 block h-44 w-full overflow-hidden rounded-lg border border-slate-100 bg-slate-50"
            onClick={onOpen}
            type="button"
          >
            <img
              alt={label}
              className="h-full w-full object-contain"
              src={asset.dataUrl}
            />
          </button>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span className="max-w-48 truncate">{asset.name}</span>
            <span>{formatDate(asset.uploadedAt)}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={onOpen} size="sm" variant="outline">
              View
            </Button>
            {onDelete ? (
              <Button onClick={onDelete} size="sm" variant="destructive">
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="mt-4 grid h-28 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm font-semibold text-muted">
          Upload in eKYC
        </div>
      )}
    </div>
  );
}

interface DocumentTileItem {
  asset: KycAsset;
  documentId?: string;
  key: string;
  label: string;
  selfie?: boolean;
  status: KycStatus;
}

type PasswordOtpChannel = "email" | "mobile";
type PasswordStep = "request" | "verify";

interface NomineeInfo {
  fullName: string;
  relationship: string;
  phone: string;
  updatedAt?: string;
}

interface ProfileExtras {
  nominee?: NomineeInfo;
  panNumber?: string;
  passwordUpdatedAt?: string;
}

const PROFILE_EXTRAS_PREFIX = "vaultbank_profile_extras_";
const EMPTY_NOMINEE: NomineeInfo = {
  fullName: "",
  relationship: "",
  phone: "",
};

function profileExtrasKey(userId?: string) {
  return userId ? `${PROFILE_EXTRAS_PREFIX}${userId}` : "";
}

function readProfileExtras(userId?: string): ProfileExtras {
  const key = profileExtrasKey(userId);
  if (!key || typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ProfileExtras) : {};
  } catch {
    return {};
  }
}

function writeProfileExtras(userId: string, extras: ProfileExtras) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(profileExtrasKey(userId), JSON.stringify(extras));
}

function panBelongsToAnotherLocalProfile(panNumber: string, userId?: string) {
  if (typeof window === "undefined" || !panNumber) {
    return false;
  }
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(PROFILE_EXTRAS_PREFIX)) {
      continue;
    }
    const ownerId = key.slice(PROFILE_EXTRAS_PREFIX.length);
    if (!ownerId || ownerId === userId) {
      continue;
    }
    try {
      const extras = JSON.parse(
        window.localStorage.getItem(key) ?? "{}",
      ) as ProfileExtras;
      if (normalizePan(extras.panNumber ?? "") === panNumber) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

function normalizePan(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

function isValidPan(value: string) {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value);
}

function isValidNomineePhone(value: string) {
  return value.replace(/\D/g, "").length >= 10;
}

function panValidationMessage(value: string) {
  if (!value) {
    return "PAN must be 10 characters: 5 letters, 4 digits, then 1 letter.";
  }
  if (isValidPan(value)) {
    return "PAN number looks valid.";
  }
  if (value.length < 10) {
    return `Enter ${10 - value.length} more character${value.length === 9 ? "" : "s"} in PAN format.`;
  }
  return "Use PAN format ABCDE1234F: 5 letters, 4 digits, then 1 letter.";
}

function maskEmail(email?: string | null) {
  if (!email) {
    return "email not added";
  }
  const [name, domain] = email.split("@");
  if (!domain) {
    return email;
  }
  return `${name.slice(0, 2)}***@${domain}`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function messageFromError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return fallback;
}

function maskMobile(phone?: string | null) {
  if (!phone) {
    return "mobile number not added";
  }
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) {
    return phone;
  }
  return `${phone.slice(0, 3)}******${digits.slice(-4)}`;
}

export function ProfilePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { accounts } = useAccounts();
  const [panel, setPanel] = useState<
    | "edit"
    | "personal"
    | "address"
    | "nominee"
    | "communication"
    | "document-preview"
    | "devices"
    | "documents"
    | "pan"
    | "password"
    | "trusted"
    | null
  >(null);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(true);
  const [loginAlertsEnabled, setLoginAlertsEnabled] = useState(true);
  const [draftName, setDraftName] = useState(auth.user?.fullName ?? "");
  const [draftEmail, setDraftEmail] = useState(auth.user?.email ?? "");
  const [draftPhone, setDraftPhone] = useState(auth.user?.phone ?? "");
  const [panNumber, setPanNumber] = useState("");
  const [draftPan, setDraftPan] = useState("");
  const [nomineeInfo, setNomineeInfo] = useState<NomineeInfo>(EMPTY_NOMINEE);
  const [draftNominee, setDraftNominee] =
    useState<NomineeInfo>(EMPTY_NOMINEE);
  const [passwordUpdatedAt, setPasswordUpdatedAt] = useState<string>();
  const [passwordChannel, setPasswordChannel] =
    useState<PasswordOtpChannel>("email");
  const [passwordStep, setPasswordStep] = useState<PasswordStep>("request");
  const [passwordOtp, setPasswordOtp] = useState("");
  const [mobileDemoOtp, setMobileDemoOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<DocumentTileItem | null>(null);
  const user = auth.user;
  const profileBusy = auth.updateProfileMutation.isPending;
  const passwordBusy =
    auth.forgotPasswordMutation.isPending || auth.resetPasswordMutation.isPending;
  const kycSubmission = useKycSubmission(user?.id);
  const accountKycComplete =
    accounts.length > 0 &&
    accounts.every((account) => account.kycStatus === KycStatus.APPROVED);
  const kycComplete =
    kycSubmission?.status === KycStatus.APPROVED || accountKycComplete;
  const displayedKycStatus =
    kycSubmission?.status ?? (accountKycComplete ? KycStatus.APPROVED : KycStatus.PENDING);
  const verifiedSelfie =
    kycSubmission?.selfieStatus === KycStatus.APPROVED ? kycSubmission.selfie : null;
  const uploadedDocumentTiles: DocumentTileItem[] = (
    kycSubmission?.documentUploads ?? []
  ).flatMap((document) => {
    const items: DocumentTileItem[] = [];
    if (document.frontDocument) {
      items.push({
        asset: document.frontDocument,
        documentId: document.id,
        key: `${document.id}-front`,
        label: `${document.documentType} - Front`,
        status: document.status,
      });
    }
    if (document.backDocument) {
      items.push({
        asset: document.backDocument,
        documentId: document.id,
        key: `${document.id}-back`,
        label: `${document.documentType} - Back`,
        status: document.status,
      });
    }
    return items;
  });
  const documentTiles: DocumentTileItem[] = [...uploadedDocumentTiles];
  if (kycSubmission?.selfie) {
    documentTiles.push({
      asset: kycSubmission.selfie,
      key: "selfie",
      label: "Selfie Photo",
      selfie: true,
      status: kycSubmission.selfieStatus,
    });
  }
  const hasKycUploads = documentTiles.length > 0;
  const hasNomineeInfo = Boolean(
    nomineeInfo.fullName && nomineeInfo.relationship && nomineeInfo.phone,
  );
  const nomineeIsValid = Boolean(
    draftNominee.fullName.trim() &&
      draftNominee.relationship.trim() &&
      isValidNomineePhone(draftNominee.phone),
  );
  const setupItems = [
    { label: "Personal Information", complete: true },
    { label: "Address", complete: true },
    { label: "Verify Identity KYC", complete: kycComplete },
    { label: "Nominee Information", complete: hasNomineeInfo },
  ];
  const completed = setupItems.filter((item) => item.complete).length;
  const percent = Math.round((completed / setupItems.length) * 100);
  const panIsValid = isValidPan(draftPan);
  const panIsDuplicate =
    panIsValid && panBelongsToAnotherLocalProfile(draftPan, user?.id);
  const showPanError = Boolean(draftPan) && (!panIsValid || panIsDuplicate);

  useEffect(() => {
    setDraftName(user?.fullName ?? "");
    setDraftEmail(user?.email ?? "");
    setDraftPhone(user?.phone ?? "");
  }, [user?.email, user?.fullName, user?.phone]);

  useEffect(() => {
    const extras = readProfileExtras(user?.id);
    const savedPan = user?.panNumber ?? extras.panNumber ?? "";
    setPanNumber(savedPan);
    setDraftPan(savedPan);
    setNomineeInfo(extras.nominee ?? EMPTY_NOMINEE);
    setDraftNominee(extras.nominee ?? EMPTY_NOMINEE);
    setPasswordUpdatedAt(extras.passwordUpdatedAt);
  }, [user?.id, user?.panNumber]);

  async function saveProfile() {
    if (panel === "edit") {
      if (!user?.id) {
        toast.error("Customer profile is still loading.");
        return;
      }

      const fullName = draftName.trim();
      const email = draftEmail.trim().toLowerCase();
      const phone = draftPhone.trim();

      if (!fullName) {
        toast.error("Enter full name.");
        return;
      }
      if (!isValidEmail(email)) {
        toast.error("Enter a valid email address.");
        return;
      }

      try {
        const updatedUser = await auth.updateProfileMutation.mutateAsync({
          email,
          fullName,
          phone: phone || null,
        });
        setDraftName(updatedUser.fullName);
        setDraftEmail(updatedUser.email);
        setDraftPhone(updatedUser.phone ?? "");
        toast.success("Email and profile details updated.");
        setPanel(null);
      } catch (error) {
        toast.error(
          messageFromError(error, "Could not update profile details."),
        );
      }
      return;
    }

    if (panel === "pan") {
      if (!user?.id) {
        toast.error("Customer profile is still loading.");
        return;
      }

      const normalizedPan = normalizePan(draftPan);
      if (!isValidPan(normalizedPan)) {
        toast.error("Enter a valid PAN number like ABCDE1234F.");
        return;
      }
      if (panBelongsToAnotherLocalProfile(normalizedPan, user.id)) {
        toast.error("This PAN number is already linked with another user.");
        return;
      }

      try {
        const updatedUser = await auth.updateProfileMutation.mutateAsync({
          panNumber: normalizedPan,
        });
        const savedPan = updatedUser.panNumber ?? normalizedPan;
        const extras = readProfileExtras(user.id);
        writeProfileExtras(user.id, { ...extras, panNumber: savedPan });
        setPanNumber(savedPan);
        setDraftPan(savedPan);
        toast.success("PAN number updated in profile.");
        setPanel(null);
      } catch (error) {
        toast.error(
          messageFromError(error, "Could not update PAN number."),
        );
      }
      return;
    }

    if (panel === "nominee") {
      if (!user?.id) {
        toast.error("Customer profile is still loading.");
        return;
      }

      const nominee: NomineeInfo = {
        fullName: draftNominee.fullName.trim(),
        relationship: draftNominee.relationship.trim(),
        phone: draftNominee.phone.trim(),
        updatedAt: new Date().toISOString(),
      };

      if (!nominee.fullName) {
        toast.error("Enter nominee full name.");
        return;
      }
      if (!nominee.relationship) {
        toast.error("Enter nominee relationship.");
        return;
      }
      if (!isValidNomineePhone(nominee.phone)) {
        toast.error("Enter a valid nominee phone number.");
        return;
      }

      const extras = readProfileExtras(user.id);
      writeProfileExtras(user.id, { ...extras, nominee });
      setNomineeInfo(nominee);
      setDraftNominee(nominee);
      toast.success("Nominee information saved.");
      setPanel(null);
      return;
    }

    toast.success("Profile changes saved locally.");
    setPanel(null);
  }

  function openPanPanel() {
    setDraftPan(panNumber);
    setPanel("pan");
  }

  function openNomineePanel() {
    setDraftNominee(nomineeInfo);
    setPanel("nominee");
  }

  function updateDraftNominee(field: keyof NomineeInfo, value: string) {
    setDraftNominee((current) => ({ ...current, [field]: value }));
  }

  function resetPasswordFields(nextChannel = passwordChannel) {
    setPasswordChannel(nextChannel);
    setPasswordStep("request");
    setPasswordOtp("");
    setMobileDemoOtp("");
    setNewPassword("");
    setConfirmPassword("");
  }

  function openPasswordPanel() {
    const defaultChannel = user?.email ? "email" : "mobile";
    resetPasswordFields(defaultChannel);
    setPanel("password");
  }

  function choosePasswordChannel(channel: PasswordOtpChannel) {
    resetPasswordFields(channel);
  }

  async function sendPasswordOtp() {
    if (passwordChannel === "email") {
      if (!user?.email) {
        toast.error("Email is not added to this profile.");
        return;
      }

      try {
        await auth.forgotPasswordMutation.mutateAsync(user.email);
        setPasswordStep("verify");
        setPasswordOtp("");
        toast.success(`OTP sent to ${maskEmail(user.email)}.`);
      } catch {
        toast.error("Could not send email OTP. Please try again.");
      }
      return;
    }

    if (!user?.phone) {
      toast.error("Mobile number is not added to this profile.");
      return;
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    setMobileDemoOtp(otp);
    setPasswordStep("verify");
    setPasswordOtp("");
    toast.success(`OTP sent to ${maskMobile(user.phone)}. Demo OTP: ${otp}`);
  }

  async function changePasswordWithOtp() {
    if (passwordStep !== "verify") {
      toast.error("Send OTP first.");
      return;
    }
    if (passwordOtp.length !== 6) {
      toast.error("Enter the 6 digit OTP.");
      return;
    }
    const failedPasswordRule = passwordRules.find((rule) => !rule.test(newPassword));
    if (failedPasswordRule) {
      toast.error(`Password needs ${failedPasswordRule.label.toLowerCase()}.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    if (passwordChannel === "email") {
      if (!user?.email) {
        toast.error("Email is not added to this profile.");
        return;
      }
      try {
        await auth.resetPasswordMutation.mutateAsync({
          email: user.email,
          otp: passwordOtp,
          newPassword,
        });
      } catch {
        toast.error("OTP verification failed. Please check the code.");
        return;
      }
    } else if (passwordOtp !== mobileDemoOtp) {
      toast.error("Incorrect mobile OTP.");
      return;
    }

    const updatedAt = new Date().toISOString();
    if (user?.id) {
      const extras = readProfileExtras(user.id);
      writeProfileExtras(user.id, { ...extras, passwordUpdatedAt: updatedAt });
    }
    setPasswordUpdatedAt(updatedAt);
    toast.success("Password changed successfully.");
    resetPasswordFields(passwordChannel);
    setPanel(null);
  }

  function downloadStatement() {
    const rows = [
      ["Account", "Number", "Balance", "Currency"],
      ...accounts.map((account) => [
        account.type,
        account.accountNumber,
        account.balance,
        account.currency,
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = "vaultbank-statement.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Statement downloaded.");
  }

  function deleteDocument(documentId: string) {
    if (!user?.id) {
      return;
    }

    updateKycSubmission(user.id, (current) => {
      const remainingDocuments = current.documentUploads.filter(
        (document) => document.id !== documentId,
      );
      const activeDocument =
        remainingDocuments.find((document) => document.id === current.activeDocumentId) ??
        remainingDocuments[remainingDocuments.length - 1];
      const deletedAddressDocument = current.addressDocumentId === documentId;

      return {
        ...current,
        activeDocumentId: activeDocument?.id,
        addressComplete: deletedAddressDocument ? false : current.addressComplete,
        addressDocumentId: deletedAddressDocument ? undefined : current.addressDocumentId,
        addressStatus: deletedAddressDocument ? KycStatus.PENDING : current.addressStatus,
        backDocument: activeDocument?.backDocument,
        documentStatus: kycIdentityStatus(remainingDocuments),
        documentType: activeDocument?.documentType ?? "PAN Card",
        documentUploads: remainingDocuments,
        frontDocument: activeDocument?.frontDocument,
        reviewedAt: undefined,
        reviewer: undefined,
        reviewNote: undefined,
      };
    });
    toast.success("Document deleted. Upload a new one from eKYC.");
  }

  function deleteSelfie() {
    if (!user?.id) {
      return;
    }

    updateKycSubmission(user.id, (current) => ({
      ...current,
      selfie: undefined,
      selfieStatus: KycStatus.PENDING,
      reviewedAt: undefined,
      reviewer: undefined,
      reviewNote: undefined,
    }));
    toast.success("Selfie deleted. Capture a new one from eKYC.");
  }

  function uploadNewKyc() {
    setPanel(null);
    setSelectedDocument(null);
    navigate("/ekyc");
  }

  function previewDocument(item: DocumentTileItem) {
    setSelectedDocument(item);
    setPanel("document-preview");
  }

  function deleteTileHandler(item: DocumentTileItem) {
    if (item.selfie) {
      return deleteSelfie;
    }
    if (!item.documentId) {
      return undefined;
    }
    const documentId = item.documentId;
    return () => deleteDocument(documentId);
  }

  const panelTitle = {
    edit: "Edit Profile",
    personal: "Personal Information",
    address: "Address",
    "document-preview": "Document Preview",
    documents: "Documents",
    nominee: "Nominee Information",
    communication: "Communication Preferences",
    devices: "Linked Devices",
    pan: "Update PAN",
    password: "Change Password",
    trusted: "Trusted Devices",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-secondary">Profile & Settings</h1>
        <p className="mt-2 text-sm text-muted">
          Manage your personal information, security preferences, and communication settings.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-5">
          <DashboardCard className="p-5">
            <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-center">
              <div className="flex items-center gap-4">
                {verifiedSelfie ? (
                  <img
                    alt="Verified profile"
                    className="h-16 w-16 rounded-full bg-slate-100 object-cover ring-2 ring-emerald-200"
                    src={verifiedSelfie.dataUrl}
                  />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-xl font-bold text-white">
                    {initials(user?.fullName)}
                  </span>
                )}
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-bold text-secondary">
                    {user?.fullName ?? "VaultBank User"}
                  </h2>
                  <p className="mt-1 truncate text-sm text-muted">
                    {user?.email ?? "Email not added"}
                  </p>
                  <p className="mt-2 flex items-center gap-2 text-sm text-muted">
                    <Smartphone className="h-4 w-4" />
                    {user?.phone ?? "Mobile number not added"}
                  </p>
                </div>
              </div>
              <div className="border-slate-200 lg:border-l lg:pl-6">
                <p className="text-xs text-muted">Customer ID</p>
                <p className="mt-1 font-bold text-secondary">
                  {customerDisplayId(user?.id)}
                </p>
                <p className="mt-3 text-xs text-muted">PAN</p>
                <p className="mt-1 font-bold text-secondary">
                  {panNumber || "Not added"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Account Status</p>
                <StatusPill className="mt-1" tone={user?.isActive === false ? "red" : "green"}>
                  {user?.isActive === false ? "Inactive" : "Active"}
                </StatusPill>
                <p className="mt-3 text-xs text-muted">eKYC Status</p>
                <StatusPill className="mt-1" tone={kycTone(displayedKycStatus)}>
                  {displayedKycStatus === KycStatus.APPROVED
                    ? "Verified"
                    : titleCase(displayedKycStatus)}
                </StatusPill>
              </div>
              <Button onClick={() => setPanel("edit")} variant="outline">
                <Pencil className="h-4 w-4" />
                Edit Profile
              </Button>
            </div>
          </DashboardCard>

          <DashboardCard className="px-5">
            <SettingsRow
              helper="Update your personal details and contact information."
              icon={User}
              onClick={() => setPanel("personal")}
              tone="blue"
              title="Personal Information"
            />
            <SettingsRow
              helper="Manage your residential and correspondence address."
              icon={Home}
              onClick={() => setPanel("address")}
              tone="green"
              title="Address"
            />
            <SettingsRow
              helper="View uploaded KYC documents and admin verification status."
              icon={FileText}
              onClick={() => setPanel("documents")}
              tone={displayedKycStatus === KycStatus.APPROVED ? "green" : "blue"}
              title="Documents"
            />
            <SettingsRow
              helper={
                hasNomineeInfo
                  ? `${nomineeInfo.fullName} - ${nomineeInfo.relationship}`
                  : "View and update your nominee details for your accounts."
              }
              icon={Users}
              onClick={openNomineePanel}
              tone="violet"
              title="Nominee Information"
            />
            <SettingsRow
              helper="Manage how we contact you and your notification preferences."
              icon={Bell}
              onClick={() => setPanel("communication")}
              tone="amber"
              title="Communication Preferences"
            />
            <SettingsRow
              helper="View and manage devices connected to your account."
              icon={Monitor}
              onClick={() => setPanel("devices")}
              tone="blue"
              title="Linked Devices"
            />
          </DashboardCard>

          <DashboardCard className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-secondary">Documents</h2>
                <p className="mt-1 text-sm text-muted">
                  Uploaded KYC files saved for this customer profile.
                </p>
              </div>
              <StatusPill tone={kycTone(displayedKycStatus)}>
                {displayedKycStatus === KycStatus.APPROVED
                  ? "Verified"
                  : titleCase(displayedKycStatus)}
              </StatusPill>
            </div>
            {hasKycUploads ? (
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                {documentTiles.map((item) => (
                  <KycDocumentTile
                    asset={item.asset}
                    key={item.key}
                    label={item.label}
                    onDelete={deleteTileHandler(item)}
                    onOpen={() => previewDocument(item)}
                    status={item.status}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-muted">
                No documents uploaded yet. Complete eKYC to save documents in this customer portal.
                <Button className="mt-4" onClick={() => navigate("/ekyc")} variant="outline">
                  Continue eKYC
                </Button>
              </div>
            )}
            {hasKycUploads ? (
              <Button className="mt-5" onClick={uploadNewKyc} variant="outline">
                Upload New Document
              </Button>
            ) : null}
          </DashboardCard>
        </div>

        <aside className="space-y-5">
          <DashboardCard className="p-5">
            <h2 className="font-bold text-secondary">Profile Setup</h2>
            <div className="mt-5 flex items-center gap-4">
              <div
                className="grid h-16 w-16 place-items-center rounded-full"
                style={{
                  background: `conic-gradient(#1B4FD8 ${percent * 3.6}deg, #E2E8F0 0deg)`,
                }}
              >
                <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-sm font-bold text-secondary">
                  {percent}%
                </span>
              </div>
              <div>
                <p className="font-bold text-secondary">
                  Your profile is {percent}% complete
                </p>
                <p className="mt-1 text-sm text-muted">
                  Complete remaining steps to get full access.
                </p>
              </div>
            </div>
            <div className="mt-5 h-2 rounded-full bg-slate-200">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${percent}%` }} />
            </div>
            <div className="mt-5 space-y-4">
              {setupItems.map((item) => (
                <div className="flex items-center justify-between gap-3 text-sm" key={item.label}>
                  <span className="flex items-center gap-2 text-secondary">
                    {item.complete ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <span className="h-5 w-5 rounded-full bg-amber-100 text-center text-xs font-bold leading-5 text-amber-700">
                        !
                      </span>
                    )}
                    {item.label}
                  </span>
                  <span className={cn(item.complete ? "text-muted" : "text-amber-700")}>
                    {item.complete ? "Completed" : "Pending"}
                  </span>
                </div>
              ))}
            </div>
            <Button className="mt-5 w-full" onClick={() => navigate("/ekyc")} variant="ghost">
              Complete Now
            </Button>
          </DashboardCard>

          <DashboardCard className="p-5">
            <h2 className="font-bold text-secondary">Quick Actions</h2>
            <div className="mt-4 space-y-2">
              {[
                {
                  label: "Documents",
                  helper: hasKycUploads
                    ? "View uploaded KYC files"
                    : "Upload your KYC document",
                  icon: FileText,
                  onClick: () => setPanel("documents"),
                },
                {
                  label: "Update PAN",
                  helper: panNumber ? `PAN ${panNumber}` : "Update your PAN details",
                  icon: CreditCard,
                  onClick: openPanPanel,
                },
                {
                  label: "Change Password",
                  helper: "Update your account password",
                  icon: Lock,
                  onClick: openPasswordPanel,
                },
                {
                  label: "Download Statement",
                  helper: "Download account statements",
                  icon: Download,
                  onClick: downloadStatement,
                },
              ].map((item) => (
                <button
                  className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50"
                  key={item.label}
                  onClick={item.onClick}
                  type="button"
                >
                  <IconTile className="h-9 w-9 rounded-lg" icon={item.icon} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-secondary">
                      {item.label}
                    </span>
                    <span className="block text-sm text-muted">{item.helper}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted" />
                </button>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard className="p-5">
            <h2 className="font-bold text-secondary">Security Settings</h2>
            <div className="mt-4 divide-y divide-slate-100">
              {[
                {
                  label: "Two-Factor Authentication",
                  value: twoFactorEnabled ? "Enabled" : "Disabled",
                  icon: ShieldCheck,
                  onClick: () => {
                    setTwoFactorEnabled((current) => !current);
                    toast.success("Two-factor setting updated.");
                  },
                },
                {
                  label: "Login Alerts",
                  value: loginAlertsEnabled ? "Enabled" : "Disabled",
                  icon: Bell,
                  onClick: () => {
                    setLoginAlertsEnabled((current) => !current);
                    toast.success("Login alert setting updated.");
                  },
                },
                {
                  label: "Change Password",
                  value: passwordUpdatedAt
                    ? `Updated ${formatDate(passwordUpdatedAt)}`
                    : "Available",
                  icon: Lock,
                  onClick: openPasswordPanel,
                },
                {
                  label: "Trusted Devices",
                  value: "2 devices",
                  icon: Monitor,
                  onClick: () => setPanel("trusted"),
                },
              ].map((item) => (
                <button
                  className="flex w-full items-center gap-3 py-3 text-left"
                  key={item.label}
                  onClick={item.onClick}
                  type="button"
                >
                  <IconTile className="h-9 w-9 rounded-lg" icon={item.icon} />
                  <span className="min-w-0 flex-1 font-semibold text-secondary">
                    {item.label}
                  </span>
                  <span className="text-sm text-muted">{item.value}</span>
                  <ChevronRight className="h-4 w-4 text-muted" />
                </button>
              ))}
            </div>
          </DashboardCard>
        </aside>
      </div>

      <ActionDialog
        bodyClassName={
          panel === "document-preview" ? "bg-slate-50 p-0" : undefined
        }
        className={
          panel === "document-preview"
            ? "max-w-6xl"
            : panel === "documents"
              ? "max-w-5xl"
              : undefined
        }
        footer={
          panel === "edit" || panel === "pan" || panel === "nominee" ? (
            <>
              <Button onClick={() => setPanel(null)} variant="outline">
                Cancel
              </Button>
              <Button
                disabled={
                  profileBusy ||
                  (panel === "pan" && !panIsValid) ||
                  (panel === "nominee" && !nomineeIsValid)
                }
                onClick={saveProfile}
              >
                {panel === "edit" && profileBusy ? "Saving..." : "Save"}
              </Button>
            </>
          ) : panel === "password" ? (
            <>
              <Button onClick={() => setPanel(null)} variant="outline">
                Cancel
              </Button>
              <Button
                disabled={passwordBusy}
                onClick={() => {
                  if (passwordStep === "request") {
                    void sendPasswordOtp();
                    return;
                  }
                  void changePasswordWithOtp();
                }}
              >
                {passwordStep === "request"
                  ? passwordBusy
                    ? "Sending..."
                    : "Send OTP"
                  : passwordBusy
                    ? "Saving..."
                    : "Change Password"}
              </Button>
            </>
          ) : (
            <Button onClick={() => setPanel(null)}>Done</Button>
          )
        }
        onOpenChange={(open) => {
          if (!open) {
            setPanel(null);
            setSelectedDocument(null);
            return;
          }
          setPanel(panel);
        }}
        open={Boolean(panel)}
        title={
          panel === "document-preview"
            ? selectedDocument?.label ?? "Document Preview"
            : panel
              ? panelTitle[panel]
              : "Profile"
        }
      >
        {panel === "edit" ? (
          <div className="grid gap-4">
            <label className="block text-sm font-semibold text-secondary">
              Full name
              <Input
                className="mt-2"
                onChange={(event) => setDraftName(event.target.value)}
                value={draftName}
              />
            </label>
            <label className="block text-sm font-semibold text-secondary">
              Email ID
              <Input
                className="mt-2"
                onChange={(event) => setDraftEmail(event.target.value)}
                placeholder="name@example.com"
                type="email"
                value={draftEmail}
              />
              <span className="mt-1 block text-xs font-normal text-muted">
                Payment and password OTPs will be sent to this email.
              </span>
            </label>
            <label className="block text-sm font-semibold text-secondary">
              Mobile number
              <Input
                className="mt-2"
                onChange={(event) => setDraftPhone(event.target.value)}
                value={draftPhone}
              />
            </label>
          </div>
        ) : null}

        {panel === "personal" ? (
          <dl className="space-y-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Name</dt>
              <dd className="font-semibold text-secondary">{draftName || user?.fullName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Email</dt>
              <dd className="font-semibold text-secondary">
                {user?.email ?? "Not added"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Phone</dt>
              <dd className="font-semibold text-secondary">
                {draftPhone || user?.phone || "Not added"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">PAN</dt>
              <dd className="font-semibold text-secondary">
                {panNumber || "Not added"}
              </dd>
            </div>
          </dl>
        ) : null}

        {panel === "address" ? (
          <div className="space-y-3 text-sm text-muted">
            <p>Residential address is ready for verification.</p>
            <Button onClick={() => navigate("/ekyc")} variant="outline">
              Continue eKYC
            </Button>
          </div>
        ) : null}

        {panel === "documents" ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-secondary">
                    {kycSubmission?.documentType ?? "KYC Documents"}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {hasKycUploads
                      ? "These files are stored for this customer profile."
                      : "No files have been uploaded for this customer yet."}
                  </p>
                </div>
                <StatusPill tone={kycTone(displayedKycStatus)}>
                  {displayedKycStatus === KycStatus.APPROVED
                    ? "Verified"
                    : titleCase(displayedKycStatus)}
                </StatusPill>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {documentTiles.map((item) => (
                <KycDocumentTile
                  asset={item.asset}
                  key={item.key}
                  label={item.label}
                  onDelete={deleteTileHandler(item)}
                  onOpen={() => previewDocument(item)}
                  status={item.status}
                />
              ))}
            </div>
            {!hasKycUploads ? (
              <Button onClick={() => navigate("/ekyc")} variant="outline">
                Continue eKYC
              </Button>
            ) : (
              <Button onClick={uploadNewKyc} variant="outline">
                Upload New Document
              </Button>
            )}
          </div>
        ) : null}

        {panel === "document-preview" && selectedDocument ? (
          <div className="grid min-h-[60vh] bg-white lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex items-center justify-center bg-slate-100 p-4 sm:p-6">
              <img
                alt={selectedDocument.label}
                className="max-h-[72vh] w-full rounded-lg object-contain shadow-sm"
                src={selectedDocument.asset.dataUrl}
              />
            </div>
            <aside className="border-t border-slate-200 p-5 lg:border-l lg:border-t-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-secondary">
                    {selectedDocument.label}
                  </p>
                  <p className="mt-1 break-words text-sm text-muted">
                    {selectedDocument.asset.name}
                  </p>
                </div>
                <StatusPill tone={kycTone(selectedDocument.status)}>
                  {titleCase(selectedDocument.status)}
                </StatusPill>
              </div>
              <dl className="mt-6 space-y-4 text-sm">
                <div>
                  <dt className="text-muted">Uploaded</dt>
                  <dd className="mt-1 font-semibold text-secondary">
                    {formatDate(selectedDocument.asset.uploadedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Verification</dt>
                  <dd className="mt-1 font-semibold text-secondary">
                    {documentStatusText(selectedDocument.status, true)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">File type</dt>
                  <dd className="mt-1 font-semibold text-secondary">
                    {selectedDocument.asset.type || "Image"}
                  </dd>
                </div>
              </dl>
              <Button
                className="mt-6 w-full"
                onClick={() => setPanel("documents")}
                variant="outline"
              >
                Back to Documents
              </Button>
            </aside>
          </div>
        ) : null}

        {panel === "nominee" ? (
          <div className="grid gap-4">
            {hasNomineeInfo ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-800">
                  Saved nominee
                </p>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-emerald-700">Name</dt>
                    <dd className="font-semibold text-secondary">
                      {nomineeInfo.fullName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-emerald-700">Relationship</dt>
                    <dd className="font-semibold text-secondary">
                      {nomineeInfo.relationship}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-emerald-700">Phone</dt>
                    <dd className="font-semibold text-secondary">
                      {nomineeInfo.phone}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
            <label className="block text-sm font-semibold text-secondary">
              Nominee full name
              <Input
                className="mt-2"
                onChange={(event) =>
                  updateDraftNominee("fullName", event.target.value)
                }
                placeholder="Nominee full name"
                value={draftNominee.fullName}
              />
            </label>
            <label className="block text-sm font-semibold text-secondary">
              Relationship
              <Input
                className="mt-2"
                onChange={(event) =>
                  updateDraftNominee("relationship", event.target.value)
                }
                placeholder="Relationship"
                value={draftNominee.relationship}
              />
            </label>
            <label className="block text-sm font-semibold text-secondary">
              Nominee phone number
              <Input
                aria-invalid={
                  Boolean(draftNominee.phone) &&
                  !isValidNomineePhone(draftNominee.phone)
                }
                className={cn(
                  "mt-2",
                  Boolean(draftNominee.phone) &&
                    !isValidNomineePhone(draftNominee.phone) &&
                    "border-red-300 focus:border-red-400",
                )}
                inputMode="tel"
                onChange={(event) =>
                  updateDraftNominee("phone", event.target.value)
                }
                placeholder="Nominee phone number"
                value={draftNominee.phone}
              />
            </label>
            <p
              className={cn(
                "text-sm",
                draftNominee.phone && !isValidNomineePhone(draftNominee.phone)
                  ? "text-red-600"
                  : "text-muted",
              )}
            >
              Enter nominee name, relationship, and a valid phone number to save.
            </p>
          </div>
        ) : null}

        {panel === "communication" ? (
          <div className="space-y-3">
            {["Email alerts", "SMS alerts", "Payment reminders"].map((item) => (
              <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-3" key={item}>
                <span className="font-semibold text-secondary">{item}</span>
                <input className="h-5 w-5 accent-primary" defaultChecked type="checkbox" />
              </label>
            ))}
          </div>
        ) : null}

        {panel === "devices" || panel === "trusted" ? (
          <div className="space-y-3">
            {["Chrome on Windows", "VaultBank mobile app"].map((item) => (
              <div
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3"
                key={item}
              >
                <span>
                  <span className="block font-semibold text-secondary">{item}</span>
                  <span className="text-sm text-muted">Trusted device</span>
                </span>
                <Button
                  onClick={() => toast.success(`${item} removed locally.`)}
                  size="sm"
                  variant="outline"
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        {panel === "pan" ? (
          <div className="grid gap-4">
            <label className="block text-sm font-semibold text-secondary">
              PAN number
              <Input
                aria-describedby="pan-validation-message"
                aria-invalid={showPanError}
                className={cn(
                  "mt-2 font-mono uppercase tracking-wide",
                  showPanError && "border-red-300 focus:border-red-400",
                  panIsValid &&
                    !panIsDuplicate &&
                    "border-emerald-300 focus:border-emerald-400",
                )}
                maxLength={10}
                onChange={(event) => setDraftPan(normalizePan(event.target.value))}
                placeholder="ABCDE1234F"
                value={draftPan}
              />
            </label>
            <p
              className={cn(
                "text-sm",
                showPanError
                  ? "text-red-600"
                  : panIsValid && !panIsDuplicate
                    ? "text-emerald-700"
                    : "text-muted",
              )}
              id="pan-validation-message"
            >
              {panIsDuplicate
                ? "This PAN number is already linked with another user."
                : panValidationMessage(draftPan)}
            </p>
            <p className="text-sm text-muted">
              The saved PAN will show on this profile after validation.
            </p>
          </div>
        ) : null}

        {panel === "password" ? (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-secondary">Receive OTP on</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <button
                  className={cn(
                    "rounded-lg border p-4 text-left transition",
                    passwordChannel === "email"
                      ? "border-primary bg-blue-50"
                      : "border-slate-200 hover:border-primary",
                    !user?.email && "cursor-not-allowed opacity-60",
                  )}
                  disabled={!user?.email}
                  onClick={() => choosePasswordChannel("email")}
                  type="button"
                >
                  <span className="flex items-center gap-2 font-semibold text-secondary">
                    <Mail className="h-4 w-4 text-primary" />
                    Email
                  </span>
                  <span className="mt-2 block text-sm text-muted">
                    {maskEmail(user?.email)}
                  </span>
                </button>
                <button
                  className={cn(
                    "rounded-lg border p-4 text-left transition",
                    passwordChannel === "mobile"
                      ? "border-primary bg-blue-50"
                      : "border-slate-200 hover:border-primary",
                    !user?.phone && "cursor-not-allowed opacity-60",
                  )}
                  disabled={!user?.phone}
                  onClick={() => choosePasswordChannel("mobile")}
                  type="button"
                >
                  <span className="flex items-center gap-2 font-semibold text-secondary">
                    <Smartphone className="h-4 w-4 text-primary" />
                    Mobile
                  </span>
                  <span className="mt-2 block text-sm text-muted">
                    {maskMobile(user?.phone)}
                  </span>
                </button>
              </div>
            </div>

            {passwordStep === "request" ? (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                An OTP will be sent to your selected contact method.
              </div>
            ) : (
              <div className="grid gap-4">
                {passwordChannel === "mobile" && mobileDemoOtp ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                    Mobile OTP for this local build: {mobileDemoOtp}
                  </div>
                ) : null}
                <label className="block text-sm font-semibold text-secondary">
                  OTP
                  <Input
                    className="mt-2 font-mono tracking-wide"
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(event) =>
                      setPasswordOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="Enter 6 digit OTP"
                    value={passwordOtp}
                  />
                </label>
                <label className="block text-sm font-semibold text-secondary">
                  New password
                  <Input
                    className="mt-2"
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Minimum 8 characters"
                    type="password"
                    value={newPassword}
                  />
                </label>
                <label className="block text-sm font-semibold text-secondary">
                  Confirm password
                  <Input
                    className="mt-2"
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Re-enter new password"
                    type="password"
                    value={confirmPassword}
                  />
                </label>
              </div>
            )}
          </div>
        ) : null}
      </ActionDialog>
    </div>
  );
}
