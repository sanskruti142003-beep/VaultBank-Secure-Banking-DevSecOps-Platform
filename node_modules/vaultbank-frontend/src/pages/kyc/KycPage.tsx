import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileText,
  Home,
  IdCard,
  Lock,
  MapPin,
  ShieldCheck,
  Upload,
  User,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  DashboardCard,
  IconTile,
  StatusPill,
} from "@/components/dashboard/DashboardCard";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/hooks/useAccounts";
import { useAuth } from "@/hooks/useAuth";
import { kycTone, titleCase } from "@/lib/dashboard-format";
import {
  addKycNotification,
  createKycDocumentUpload,
  createKycNotification,
  dataUrlToKycAsset,
  fileToKycAsset,
  updateKycSubmission,
  useKycSubmission,
  type KycAsset,
} from "@/lib/kyc-store";
import { cn } from "@/lib/utils";
import { KycStatus } from "@/types/accounts.types";

const steps = [
  { label: "Personal Details", helper: "In Progress", icon: User },
  { label: "Document Upload", helper: "Pending", icon: FileText },
  { label: "Selfie Verification", helper: "Pending", icon: Camera },
  { label: "Address Verification", helper: "Pending", icon: MapPin },
  { label: "Review", helper: "Pending", icon: ShieldCheck },
];

const documentTypes = [
  { label: "PAN Card", icon: IdCard },
  { label: "Aadhaar Card", icon: FileText },
  { label: "Passport", icon: ShieldCheck },
  { label: "Driving Licence", icon: IdCard },
];

function initials(name: string | undefined) {
  return (name ?? "VB")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function messageFromError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export function KycPage() {
  const auth = useAuth();
  const { accounts } = useAccounts();
  const userId = auth.user?.id;
  const submission = useKycSubmission(userId);
  const [documentType, setDocumentType] = useState(submission?.documentType ?? "PAN Card");
  const [frontFile, setFrontFile] = useState<KycAsset | null>(null);
  const [backFile, setBackFile] = useState<KycAsset | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const photoUploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!submission) {
      setDocumentType("PAN Card");
      setFrontFile(null);
      setBackFile(null);
      return;
    }
    setDocumentType(submission.documentType);
    setFrontFile(null);
    setBackFile(null);
  }, [submission?.updatedAt, submission?.userId]);

  useEffect(() => {
    if (!videoRef.current || !cameraStream) {
      return;
    }
    videoRef.current.srcObject = cameraStream;
    void videoRef.current.play().catch(() => {
      setCameraError("Camera preview could not start. Check browser camera permission.");
    });
  }, [cameraStream]);

  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraStream]);

  const accountStatus = useMemo(() => {
    if (accounts.some((account) => account.kycStatus === KycStatus.REJECTED)) {
      return KycStatus.REJECTED;
    }
    if (accounts.length && accounts.every((account) => account.kycStatus === KycStatus.APPROVED)) {
      return KycStatus.APPROVED;
    }
    return KycStatus.PENDING;
  }, [accounts]);
  const currentStatus = submission?.status ?? accountStatus;
  const documentStatus = submission?.documentStatus ?? KycStatus.PENDING;
  const selfieStatus = submission?.selfieStatus ?? KycStatus.PENDING;
  const addressStatus = submission?.addressStatus ?? KycStatus.PENDING;
  const verified = currentStatus === KycStatus.APPROVED;
  const documentComplete = Boolean(submission?.frontDocument || frontFile);
  const selfieComplete = Boolean(submission?.selfie);
  const addressComplete = addressStatus === KycStatus.APPROVED;
  const addressSubmitted = Boolean(submission?.addressDocumentId);
  const currentStep = verified
    ? 5
    : !documentComplete
      ? 2
      : !selfieComplete
        ? 3
        : !addressComplete
          ? 4
          : 5;
  const progress = verified
    ? 100
    : [true, documentComplete, selfieComplete, addressComplete].filter(Boolean).length * 20;
  const statusTitle = verified
    ? "Review Complete"
    : currentStatus === KycStatus.REJECTED
      ? "Resubmission Required"
      : currentStep === 5
        ? "Pending Admin Review"
        : steps[currentStep - 1]?.label;

  function ensureUserId() {
    if (!userId) {
      toast.error("Please sign in before continuing KYC.");
      return null;
    }
    return userId;
  }

  function stopCamera() {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
  }

  async function startCamera() {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera is not available in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user" },
      });
      setCameraStream(stream);
    } catch {
      setCameraError("Allow camera permission, then try again.");
    }
  }

  function fallbackSelfieDataUrl() {
    const label = initials(auth.user?.fullName) || "VB";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480"><rect width="480" height="480" fill="#E8EEF9"/><circle cx="240" cy="210" r="110" fill="#1B4FD8"/><text x="240" y="230" text-anchor="middle" font-family="Arial, sans-serif" font-size="82" font-weight="700" fill="#fff">${label}</text><text x="240" y="370" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#10233F">Selfie submitted</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  async function handleDocumentUpload(
    event: ChangeEvent<HTMLInputElement>,
    side: "front" | "back",
  ) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Upload a file smaller than 5MB.");
      event.target.value = "";
      return;
    }

    try {
      const asset = await fileToKycAsset(file);
      if (side === "front") {
        setFrontFile(asset);
      } else {
        setBackFile(asset);
      }
      event.target.value = "";
      toast.success(`${side === "front" ? "Front" : "Back"} document added.`);
    } catch {
      toast.error("Could not read this document. Please upload another image.");
    }
  }

  function saveDocuments() {
    const id = ensureUserId();
    if (!id) {
      return;
    }
    if (!frontFile) {
      toast.error("Upload the front side document first.");
      return;
    }
    const documentUpload = createKycDocumentUpload(documentType, frontFile, backFile);
    try {
      updateKycSubmission(id, (current) =>
        addKycNotification(
          {
            ...current,
            activeDocumentId: documentUpload.id,
            addressComplete:
              documentType === "Aadhaar Card" ? false : current.addressComplete,
            addressDocumentId:
              documentType === "Aadhaar Card"
                ? documentUpload.id
                : current.addressDocumentId,
            addressStatus:
              documentType === "Aadhaar Card" ? KycStatus.PENDING : current.addressStatus,
            documentType,
            documentUploads: [...current.documentUploads, documentUpload],
            frontDocument: documentUpload.frontDocument,
            backDocument: documentUpload.backDocument,
            documentStatus: KycStatus.PENDING,
            submittedAt: documentUpload.submittedAt,
            reviewedAt: undefined,
            reviewer: undefined,
            reviewNote: undefined,
          },
          createKycNotification(
            "Document sent for review",
            documentType === "Aadhaar Card"
              ? "Aadhaar card is pending admin verification for identity and address proof."
              : `${documentType} is pending admin verification.`,
            "info",
          ),
        ),
      );
    } catch (error) {
      toast.error(messageFromError(error, "Could not save this document."));
      return;
    }
    setFrontFile(null);
    setBackFile(null);
    toast.success("Document saved and sent to admin for verification.");
  }

  function saveSelfiePhoto(selfie: KycAsset, successMessage: string) {
    const id = ensureUserId();
    if (!id) {
      return;
    }

    try {
      updateKycSubmission(id, (current) =>
        addKycNotification(
          {
            ...current,
            selfie,
            selfieStatus: KycStatus.PENDING,
            submittedAt: current.submittedAt ?? new Date().toISOString(),
            reviewedAt: undefined,
            reviewer: undefined,
            reviewNote: undefined,
          },
          createKycNotification(
            "Photo sent for review",
            "Your photo is pending admin verification.",
            "info",
          ),
        ),
      );
    } catch (error) {
      toast.error(messageFromError(error, "Could not save this photo."));
      return;
    }
    toast.success(successMessage);
  }

  function captureSelfie() {
    let dataUrl = "";
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.videoWidth && video.videoHeight) {
      const maxDimension = 720;
      const longestSide = Math.max(video.videoWidth, video.videoHeight);
      const scale = longestSide > maxDimension ? maxDimension / longestSide : 1;
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      dataUrl = canvas.toDataURL("image/jpeg", 0.74);
    } else {
      dataUrl = fallbackSelfieDataUrl();
    }

    const selfie = dataUrlToKycAsset(
      dataUrl,
      dataUrl.startsWith("data:image/svg") ? "selfie-capture.svg" : "selfie-capture.jpg",
      dataUrl.startsWith("data:image/svg") ? "image/svg+xml" : "image/jpeg",
    );
    saveSelfiePhoto(selfie, "Selfie captured and sent to admin for verification.");
    stopCamera();
  }

  async function handlePhotoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Upload a photo smaller than 5MB.");
      event.target.value = "";
      return;
    }

    try {
      const photo = await fileToKycAsset(file);
      saveSelfiePhoto(photo, "Photo uploaded and sent to admin for verification.");
      event.target.value = "";
      stopCamera();
    } catch {
      toast.error("Could not read this photo. Please upload another image.");
    }
  }

  const checklist = [
    {
      label: "Identity Proof",
      done: verified || documentStatus === KycStatus.APPROVED,
      rejected: documentStatus === KycStatus.REJECTED,
      helper: documentStatus === KycStatus.APPROVED
        ? "Verified"
        : documentStatus === KycStatus.REJECTED
          ? "Rejected"
          : documentComplete
            ? "Pending admin verification"
            : "Pending",
      icon: FileText,
    },
    {
      label: "Address Proof",
      done: verified || addressStatus === KycStatus.APPROVED,
      rejected: addressStatus === KycStatus.REJECTED,
      helper: addressStatus === KycStatus.APPROVED
        ? "Verified"
        : addressStatus === KycStatus.REJECTED
          ? "Rejected"
          : addressSubmitted
            ? "Pending admin verification"
            : "Upload Aadhaar card",
      icon: Home,
    },
    {
      label: "Selfie Verification",
      done: verified || selfieStatus === KycStatus.APPROVED,
      rejected: selfieStatus === KycStatus.REJECTED,
      helper: selfieStatus === KycStatus.APPROVED
        ? "Verified"
        : selfieStatus === KycStatus.REJECTED
          ? "Rejected"
          : selfieComplete
            ? "Pending admin verification"
            : "Pending",
      icon: Camera,
    },
    { label: "Personal Details", done: true, rejected: false, helper: "Completed", icon: User },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-secondary">eKYC Verification</h1>
        <p className="mt-2 text-sm text-muted">
          Complete identity verification to unlock all banking features.
        </p>
      </div>

      <DashboardCard className="p-4">
        <div className="grid gap-4 md:grid-cols-5">
          {steps.map((step, index) => {
            const stepNumber = index + 1;
            const active = stepNumber === currentStep && !verified;
            const complete = verified || stepNumber < currentStep;
            const Icon = step.icon;
            return (
              <div className="flex items-center gap-3" key={step.label}>
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold",
                    active
                      ? "border border-primary bg-primary/10 text-primary"
                      : complete
                        ? "bg-primary text-white"
                        : "bg-slate-100 text-slate-500",
                  )}
                >
                    {complete ? stepNumber : <Icon className="h-4 w-4" />}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-secondary">
                    {step.label}
                  </span>
                  <span className="text-xs text-muted">
                    {verified || complete ? "Completed" : active ? "In Progress" : step.helper}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </DashboardCard>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <DashboardCard className="p-5">
            <h2 className="text-lg font-bold text-secondary">
              Step 2: Document Upload
            </h2>
            <p className="mt-1 text-sm text-muted">
              Upload a valid government-issued document
            </p>

            <p className="mt-6 text-sm font-semibold text-secondary">
              Select Document Type
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {documentTypes.map((item) => {
                const selected = documentType === item.label;
                return (
                  <button
                    className={cn(
                      "flex min-h-28 items-center gap-4 rounded-xl border p-4 text-left transition",
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-slate-200 hover:border-primary/30",
                    )}
                    key={item.label}
                    onClick={() => {
                      setDocumentType(item.label);
                      setFrontFile(null);
                      setBackFile(null);
                    }}
                    type="button"
                  >
                    <IconTile icon={item.icon} tone={selected ? "blue" : "slate"} />
                    <span className="font-semibold text-secondary">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <p className="mt-6 text-sm font-semibold text-secondary">
              Upload {documentType}
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {[
                {
                  label: "Front Side",
                  file: frontFile,
                  side: "front" as const,
                  required: true,
                },
                {
                  label: "Back Side Optional",
                  file: backFile,
                  side: "back" as const,
                  required: false,
                },
              ].map((item) => (
                <label
                  className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-primary hover:bg-primary/5"
                  key={item.label}
                >
                  {item.file ? (
                    <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                  ) : (
                    <Upload className="h-7 w-7 text-primary" />
                  )}
                  <span className="mt-3 text-sm font-semibold text-secondary">
                    {item.label}
                  </span>
                  <span className="mt-2 text-xs text-muted">
                    {item.file ? item.file.name : "PNG, JPG, JPEG Max 5MB"}
                  </span>
                  <input
                    accept=".png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(event) => void handleDocumentUpload(event, item.side)}
                    required={item.required}
                    type="file"
                  />
                </label>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-slate-600">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Your documents are encrypted and securely stored.
              </span>
              <Lock className="h-4 w-4 text-primary" />
            </div>

            <div className="mt-5 flex justify-between">
              <Button
                onClick={() => {
                  setFrontFile(null);
                  setBackFile(null);
                  toast("Upload form cleared.");
                }}
                variant="outline"
              >
                Back
              </Button>
              <Button onClick={saveDocuments}>Save & Continue</Button>
            </div>
          </DashboardCard>

          <DashboardCard className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-secondary">
                  Step 3: Selfie Verification
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Position your face in the frame
                </p>
              </div>
              <span className="text-sm font-semibold text-emerald-600">Live</span>
            </div>
            <div className="mt-5 flex aspect-[4/5] min-h-80 flex-col items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-slate-200 to-slate-100 p-6 text-center">
              {cameraStream ? (
                <video
                  className="h-44 w-44 rounded-full border-2 border-white object-cover shadow-lg"
                  muted
                  playsInline
                  ref={videoRef}
                />
              ) : submission?.selfie ? (
                <img
                  alt="Submitted selfie"
                  className="h-44 w-44 rounded-full border-2 border-white object-cover shadow-lg"
                  src={submission.selfie.dataUrl}
                />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center rounded-full border-2 border-dashed border-white bg-primary text-4xl font-bold text-white shadow-lg">
                  {initials(auth.user?.fullName)}
                </div>
              )}
              <p className="mt-5 rounded-full bg-slate-950/70 px-4 py-2 text-sm font-semibold text-white">
                {selfieStatus === KycStatus.APPROVED
                  ? "Selfie verified by admin"
                  : selfieStatus === KycStatus.REJECTED
                    ? "Selfie rejected. Capture again"
                    : selfieComplete
                      ? "Selfie pending admin verification"
                      : "Keep your face centered and look straight"}
              </p>
              <Button
                className="mt-8"
                onClick={cameraStream ? captureSelfie : startCamera}
              >
                {selfieComplete ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Camera className="h-5 w-5" />
                )}
                {cameraStream ? "Capture Selfie" : selfieComplete ? "Retake Selfie" : "Start Camera"}
              </Button>
              {cameraStream ? (
                <Button className="mt-3" onClick={stopCamera} variant="ghost">
                  Cancel Camera
                </Button>
              ) : null}
              {cameraError ? (
                <p className="mt-3 text-sm font-semibold text-red-600">{cameraError}</p>
              ) : null}
              <canvas className="hidden" ref={canvasRef} />
              <input
                accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                className="hidden"
                onChange={(event) => void handlePhotoUpload(event)}
                ref={photoUploadRef}
                type="file"
              />
              <Button
                className="mt-4"
                onClick={() => photoUploadRef.current?.click()}
                variant="outline"
              >
                <Upload className="h-4 w-4" />
                Upload Photo
              </Button>
            </div>
          </DashboardCard>
        </div>

        <aside className="space-y-5">
          <DashboardCard className="p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-bold text-secondary">Verification Status</h2>
              <StatusPill tone={kycTone(currentStatus)}>
                {verified
                  ? "Verified"
                  : currentStatus === KycStatus.PENDING && currentStep === 5
                    ? "Pending Review"
                    : titleCase(currentStatus)}
              </StatusPill>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <IconTile icon={FileText} />
              <div>
                <p className="font-semibold text-primary">
                  {statusTitle}
                </p>
                <p className="text-sm text-muted">
                  {verified
                    ? "All steps complete"
                    : currentStep === 5
                      ? "Waiting for admin verification"
                      : `Step ${currentStep} of 5`}
                </p>
              </div>
            </div>
            <div className="mt-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Progress</span>
                <span className="font-semibold text-secondary">
                  {progress}%
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-200">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <p className="mt-5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Your information is secure and encrypted
            </p>
          </DashboardCard>

          <DashboardCard className="p-5">
            <h2 className="font-bold text-secondary">
              Required Documents Checklist
            </h2>
            <div className="mt-5 space-y-4">
              {checklist.map((item) => (
                <div className="flex items-center gap-3" key={item.label}>
                  <IconTile
                    className="h-9 w-9 rounded-lg"
                    icon={item.icon}
                    tone={item.rejected ? "red" : item.done ? "green" : "blue"}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-secondary">
                      {item.label}
                    </span>
                    <span className="text-xs text-muted">
                      {item.helper}
                    </span>
                  </span>
                  {item.done ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : item.rejected ? (
                    <XCircle className="h-5 w-5 text-red-600" />
                  ) : (
                    <span className="h-5 w-5 rounded-full border border-slate-300" />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-5 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-700">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              Make sure all documents are clear, valid, and not expired.
            </div>
          </DashboardCard>
        </aside>
      </div>
    </div>
  );
}
