export function isoAssessmentDate(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const uk = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (uk) return `${uk[3]}-${uk[2]}-${uk[1]}`;
  return text;
}

export function assessmentConfirmationPayload(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    assessor: String(data.get("assessor") || "").trim(),
    assessment_date: isoAssessmentDate(data.get("assessment_date")),
    reviewed_by: String(data.get("reviewed_by") || "").trim(),
    approval_date: isoAssessmentDate(data.get("approval_date")),
    next_review_date: isoAssessmentDate(data.get("next_review_date")),
    status: String(data.get("status") || ""),
    notes: String(data.get("notes") || ""),
    confirmation: data.get("confirmation") === "on",
  };
}

export type ConfirmationDates = {
  assessmentDate: string;
  approvalDate: string;
  nextReviewDate: string;
  nextReviewManuallySet: boolean;
};

export function localIsoDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addTwelveMonths(date: string) {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]) + 1;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export function initialConfirmationDates(assessmentDate: string): ConfirmationDates {
  return {
    assessmentDate,
    approvalDate: assessmentDate,
    nextReviewDate: addTwelveMonths(assessmentDate),
    nextReviewManuallySet: false,
  };
}

export function assessmentDateChanged(
  state: ConfirmationDates,
  assessmentDate: string,
): ConfirmationDates {
  return {
    ...state,
    assessmentDate,
    approvalDate: assessmentDate,
    nextReviewDate: addTwelveMonths(assessmentDate),
    nextReviewManuallySet: false,
  };
}

export function approvalDateChanged(
  state: ConfirmationDates,
  approvalDate: string,
): ConfirmationDates {
  return {
    ...state,
    approvalDate,
    nextReviewDate: addTwelveMonths(approvalDate),
    nextReviewManuallySet: false,
  };
}

export function nextReviewDateChanged(
  state: ConfirmationDates,
  nextReviewDate: string,
): ConfirmationDates {
  return { ...state, nextReviewDate, nextReviewManuallySet: true };
}

export async function submitAssessmentConfirmation<T>(
  assessmentId: number,
  payload: ReturnType<typeof assessmentConfirmationPayload>,
  request: (path: string, options: RequestInit) => Promise<unknown>,
) {
  return request(`/risk-assessments/${assessmentId}/review`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<T>;
}

export async function runAssessmentConfirmation<T>(options: {
  assessmentId: number;
  payload: ReturnType<typeof assessmentConfirmationPayload>;
  request: (path: string, requestOptions: RequestInit) => Promise<unknown>;
  setSaving: (saving: boolean) => void;
  onSuccess: (result: T) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  options.setSaving(true);
  try {
    const result = await submitAssessmentConfirmation<T>(
      options.assessmentId,
      options.payload,
      options.request,
    );
    await options.onSuccess(result);
    return result;
  } catch (error) {
    options.onError(
      error instanceof Error
        ? error.message
        : "Assessment confirmation could not be saved",
    );
    return undefined;
  } finally {
    options.setSaving(false);
  }
}
