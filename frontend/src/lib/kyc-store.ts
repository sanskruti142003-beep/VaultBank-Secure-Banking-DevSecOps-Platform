import { useCallback, useEffect, useState } from "react";
import { KycStatus } from "@/types/accounts.types";

export type KycNotificationTone = "info" | "success" | "warning" | "danger";

export interface KycAsset {
  dataUrl: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
}

export interface KycDocumentUpload {
  id: string;
  documentType: string;
  frontDocument?: KycAsset;
  backDocument?: KycAsset;
  status: KycStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewer?: string;
  reviewNote?: string;
}

export interface KycNotification {
  id: string;
  title: string;
  message: string;
  tone: KycNotificationTone;
  createdAt: string;
  read: boolean;
}

export interface KycSubmission {
  userId: string;
  documentType: string;
  frontDocument?: KycAsset;
  backDocument?: KycAsset;
  documentUploads: KycDocumentUpload[];
  activeDocumentId?: string;
  selfie?: KycAsset;
  addressDocumentId?: string;
  addressComplete: boolean;
  addressStatus: KycStatus;
  documentStatus: KycStatus;
  selfieStatus: KycStatus;
  status: KycStatus;
  submittedAt?: string;
  reviewedAt?: string;
  reviewer?: string;
  reviewNote?: string;
  updatedAt: string;
  notifications: KycNotification[];
}

export const KYC_IDENTITY_DOCUMENT_TYPES = [
  "PAN Card",
  "Passport",
  "Driving Licence",
] as const;

const KYC_STORAGE_KEY = "vaultbank_kyc_submissions";
const KYC_UPDATED_EVENT = "vaultbank:kyc-updated";
const KYC_IMAGE_TARGET_LENGTH = 420_000;
const KYC_DOCUMENT_HISTORY_LIMIT = 6;

const KYC_IMAGE_COMPRESSION_STEPS = [
  { maxDimension: 1280, quality: 0.82 },
  { maxDimension: 1080, quality: 0.76 },
  { maxDimension: 900, quality: 0.7 },
  { maxDimension: 720, quality: 0.64 },
];
const KYC_PREVIEW_UNAVAILABLE_DATA_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" fill="#F1F5F9"/><rect x="90" y="70" width="460" height="280" rx="18" fill="#E2E8F0"/><text x="320" y="205" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#475569">Preview unavailable</text><text x="320" y="245" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#64748B">Document record saved</text></svg>',
)}`;

function now() {
  return new Date().toISOString();
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function emptySubmission(userId: string): KycSubmission {
  return {
    userId,
    documentType: "PAN Card",
    documentUploads: [],
    addressComplete: false,
    addressStatus: KycStatus.PENDING,
    documentStatus: KycStatus.PENDING,
    selfieStatus: KycStatus.PENDING,
    status: KycStatus.PENDING,
    updatedAt: now(),
    notifications: [],
  };
}

export function isKycIdentityDocumentType(documentType: string) {
  return KYC_IDENTITY_DOCUMENT_TYPES.includes(
    documentType as (typeof KYC_IDENTITY_DOCUMENT_TYPES)[number],
  );
}

export function kycIdentityStatus(documents: KycDocumentUpload[]): KycStatus {
  const identityDocuments = documents.filter((document) =>
    isKycIdentityDocumentType(document.documentType),
  );

  if (!identityDocuments.length) {
    return KycStatus.PENDING;
  }
  if (identityDocuments.some((document) => document.status === KycStatus.REJECTED)) {
    return KycStatus.REJECTED;
  }
  if (identityDocuments.every((document) => document.status === KycStatus.APPROVED)) {
    return KycStatus.APPROVED;
  }
  return KycStatus.PENDING;
}

function resolveOverallStatus(submission: KycSubmission): KycStatus {
  if (
    submission.documentStatus === KycStatus.REJECTED ||
    submission.selfieStatus === KycStatus.REJECTED ||
    submission.addressStatus === KycStatus.REJECTED
  ) {
    return KycStatus.REJECTED;
  }

  if (
    submission.frontDocument &&
    submission.selfie &&
    submission.documentStatus === KycStatus.APPROVED &&
    submission.selfieStatus === KycStatus.APPROVED &&
    submission.addressStatus === KycStatus.APPROVED
  ) {
    return KycStatus.APPROVED;
  }

  return KycStatus.PENDING;
}

function legacyDocumentId(submission: KycSubmission) {
  return [
    "legacy-document",
    submission.userId,
    submission.documentType,
    submission.frontDocument?.uploadedAt ?? submission.submittedAt ?? "draft",
  ].join("-");
}

function normalizeSubmission(submission: KycSubmission): KycSubmission {
  const documentUploads =
    submission.documentUploads?.length
      ? submission.documentUploads
      : submission.frontDocument || submission.backDocument
        ? [
            {
              id: legacyDocumentId(submission),
              documentType: submission.documentType,
              frontDocument: submission.frontDocument,
              backDocument: submission.backDocument,
              status: submission.documentStatus ?? KycStatus.PENDING,
              submittedAt: submission.submittedAt ?? submission.frontDocument?.uploadedAt ?? now(),
              reviewedAt: submission.reviewedAt,
              reviewer: submission.reviewer,
              reviewNote: submission.reviewNote,
            },
          ]
        : [];
  const activeDocumentId = submission.activeDocumentId ?? documentUploads.at(-1)?.id;
  const activeIdentityDocument = [...documentUploads]
    .reverse()
    .find((document) => isKycIdentityDocumentType(document.documentType));
  const activeDocument =
    activeIdentityDocument ??
    documentUploads.find((document) => document.id === activeDocumentId) ??
    documentUploads.at(-1);
  const latestAadhaarDocument = [...documentUploads]
    .reverse()
    .find(
      (document) =>
        document.documentType === "Aadhaar Card" && Boolean(document.frontDocument),
    );
  const addressDocumentId = submission.addressDocumentId ?? latestAadhaarDocument?.id;
  const addressStatus =
    submission.addressStatus ??
    (submission.addressComplete ? KycStatus.APPROVED : KycStatus.PENDING);
  const updated: KycSubmission = {
    ...emptySubmission(submission.userId),
    ...submission,
    activeDocumentId,
    addressComplete: addressStatus === KycStatus.APPROVED,
    addressDocumentId,
    addressStatus,
    backDocument: activeDocument?.backDocument,
    documentStatus: kycIdentityStatus(documentUploads),
    documentType: activeDocument?.documentType ?? submission.documentType,
    documentUploads,
    frontDocument: activeDocument?.frontDocument,
    notifications: submission.notifications ?? [],
    updatedAt: submission.updatedAt ?? now(),
  };

  return {
    ...updated,
    status: resolveOverallStatus(updated),
  };
}

function emitKycUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(KYC_UPDATED_EVENT));
  }
}

function isQuotaExceededError(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

function storageSafeAsset(asset?: KycAsset): KycAsset | undefined {
  if (!asset || asset.dataUrl.length <= KYC_IMAGE_TARGET_LENGTH) {
    return asset;
  }
  return {
    ...asset,
    dataUrl: KYC_PREVIEW_UNAVAILABLE_DATA_URL,
    type: "image/svg+xml",
  };
}

function storageSafeDocumentUpload(
  documentUpload: KycDocumentUpload,
): KycDocumentUpload {
  return {
    ...documentUpload,
    backDocument: storageSafeAsset(documentUpload.backDocument),
    frontDocument: storageSafeAsset(documentUpload.frontDocument),
  };
}

function compactSubmissionForStorage(
  submission: KycSubmission,
  replaceOversizedAssets = false,
): KycSubmission {
  const importantDocumentIds = new Set(
    [submission.activeDocumentId, submission.addressDocumentId].filter(Boolean),
  );
  const documentsByImportance = [...submission.documentUploads].reverse();
  const keptDocuments = documentsByImportance
    .filter((document, index) => {
      if (importantDocumentIds.has(document.id)) {
        return true;
      }
      return index < KYC_DOCUMENT_HISTORY_LIMIT;
    })
    .reverse();

  return {
    ...submission,
    backDocument: replaceOversizedAssets
      ? storageSafeAsset(submission.backDocument)
      : submission.backDocument,
    documentUploads: replaceOversizedAssets
      ? keptDocuments.map(storageSafeDocumentUpload)
      : keptDocuments,
    frontDocument: replaceOversizedAssets
      ? storageSafeAsset(submission.frontDocument)
      : submission.frontDocument,
    notifications: (submission.notifications ?? []).slice(0, 15),
    selfie: replaceOversizedAssets
      ? storageSafeAsset(submission.selfie)
      : submission.selfie,
  };
}

function writeSubmissions(submissions: KycSubmission[]) {
  if (!canUseStorage()) {
    return;
  }

  const compacted = submissions.map((submission) =>
    compactSubmissionForStorage(submission),
  );
  try {
    window.localStorage.setItem(KYC_STORAGE_KEY, JSON.stringify(compacted));
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      throw error;
    }
    const storageSafe = submissions.map((submission) =>
      compactSubmissionForStorage(submission, true),
    );
    window.localStorage.removeItem(KYC_STORAGE_KEY);
    try {
      window.localStorage.setItem(KYC_STORAGE_KEY, JSON.stringify(storageSafe));
    } catch {
      throw new Error(
        "Browser storage is full. Remove older KYC uploads or use a smaller image.",
      );
    }
  }
  emitKycUpdated();
}

export function getKycSubmissions(): KycSubmission[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(KYC_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as KycSubmission[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item.userId).map(normalizeSubmission)
      : [];
  } catch {
    return [];
  }
}

export function getKycSubmission(userId?: string | null): KycSubmission | null {
  if (!userId) {
    return null;
  }
  return getKycSubmissions().find((submission) => submission.userId === userId) ?? null;
}

export function createKycNotification(
  title: string,
  message: string,
  tone: KycNotificationTone = "info",
): KycNotification {
  return {
    id: newId("kyc-note"),
    title,
    message,
    tone,
    createdAt: now(),
    read: false,
  };
}

export function createKycDocumentUpload(
  documentType: string,
  frontDocument: KycAsset,
  backDocument?: KycAsset | null,
): KycDocumentUpload {
  return {
    id: newId("kyc-document"),
    documentType,
    frontDocument,
    backDocument: backDocument ?? undefined,
    status: KycStatus.PENDING,
    submittedAt: now(),
  };
}

export function addKycNotification(
  submission: KycSubmission,
  notification: KycNotification,
): KycSubmission {
  return {
    ...submission,
    notifications: [notification, ...(submission.notifications ?? [])].slice(0, 30),
  };
}

export function saveKycSubmission(submission: KycSubmission): KycSubmission {
  const normalized = normalizeSubmission({ ...submission, updatedAt: now() });
  const submissions = getKycSubmissions();
  const existingIndex = submissions.findIndex((item) => item.userId === normalized.userId);
  const next =
    existingIndex >= 0
      ? submissions.map((item, index) => (index === existingIndex ? normalized : item))
      : [normalized, ...submissions];

  writeSubmissions(next);
  return normalized;
}

export function updateKycSubmission(
  userId: string,
  updater: (submission: KycSubmission) => KycSubmission,
): KycSubmission {
  const current = getKycSubmission(userId) ?? emptySubmission(userId);
  return saveKycSubmission(updater(current));
}

export function markKycNotificationsRead(userId?: string | null) {
  if (!userId) {
    return;
  }
  updateKycSubmission(userId, (submission) => ({
    ...submission,
    notifications: submission.notifications.map((notification) => ({
      ...notification,
      read: true,
    })),
  }));
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to preview this image."));
    image.src = dataUrl;
  });
}

function canvasDataUrl(
  image: HTMLImageElement,
  maxDimension: number,
  quality: number,
) {
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = longestSide > maxDimension ? maxDimension / longestSide : 1;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to optimize this image.");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

async function optimizeKycImageDataUrl(
  dataUrl: string,
  name: string,
): Promise<KycAsset> {
  if (dataUrl.startsWith("data:image/svg")) {
    return dataUrlToKycAsset(dataUrl, name, "image/svg+xml");
  }

  const image = await loadImage(dataUrl);
  let bestDataUrl = dataUrl;
  for (const step of KYC_IMAGE_COMPRESSION_STEPS) {
    const optimized = canvasDataUrl(image, step.maxDimension, step.quality);
    bestDataUrl = optimized;
    if (optimized.length <= KYC_IMAGE_TARGET_LENGTH) {
      break;
    }
  }

  return dataUrlToKycAsset(bestDataUrl, name, "image/jpeg");
}

export function fileToKycAsset(file: File): Promise<KycAsset> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read file."));
        return;
      }

      void optimizeKycImageDataUrl(reader.result, file.name)
        .then(resolve)
        .catch(reject);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

export function dataUrlToKycAsset(
  dataUrl: string,
  name = "selfie-capture.png",
  type = "image/png",
): KycAsset {
  return {
    dataUrl,
    name,
    size: Math.ceil((dataUrl.length * 3) / 4),
    type,
    uploadedAt: now(),
  };
}

export function useKycSubmission(userId?: string | null) {
  const readSubmission = useCallback(() => getKycSubmission(userId), [userId]);
  const [submission, setSubmission] = useState<KycSubmission | null>(() => readSubmission());

  useEffect(() => {
    setSubmission(readSubmission());

    function sync() {
      setSubmission(readSubmission());
    }

    window.addEventListener("storage", sync);
    window.addEventListener(KYC_UPDATED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(KYC_UPDATED_EVENT, sync);
    };
  }, [readSubmission]);

  return submission;
}

export function useKycSubmissions() {
  const [submissions, setSubmissions] = useState<KycSubmission[]>(() => getKycSubmissions());

  useEffect(() => {
    function sync() {
      setSubmissions(getKycSubmissions());
    }

    window.addEventListener("storage", sync);
    window.addEventListener(KYC_UPDATED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(KYC_UPDATED_EVENT, sync);
    };
  }, []);

  return submissions;
}
