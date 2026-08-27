export type RequestKind =
  | "repair"
  | "part";

export type PreferredContact =
  | "phone"
  | "whatsapp"
  | "telegram"
  | "email"
  | "any";

export interface BaseRequestPayload {
  kind: RequestKind;

  name: string;
  phone: string;
  city: string;

  preferredContact: PreferredContact;

  description: string;
}

export interface RepairRequestPayload
  extends BaseRequestPayload {
  kind: "repair";

  machine: string;
  machineModel: string;

  controller: string;

  alarmCode: string;

  component: string;

  machineStatus: string;
}

export interface PartRequestPayload
  extends BaseRequestPayload {
  kind: "part";

  partName: string;
  brand: string;
  partNumber: string;

  quantity: number;

  machine: string;
  machineModel: string;

  conditionPreference: string;
}

export type ConversionRequestPayload =
  | RepairRequestPayload
  | PartRequestPayload;

export const preferredContactLabels: Record<
  PreferredContact,
  string
> = {
  phone: "تماس تلفنی",
  whatsapp: "واتساپ",
  telegram: "تلگرام",
  email: "ایمیل",
  any: "هر روش در دسترس",
};

export const repairMachineStatusLabels: Record<
  string,
  string
> = {
  stopped: "دستگاه متوقف است",
  intermittent: "خرابی مقطعی / متناوب",
  degraded:
    "دستگاه کار می‌کند اما عملکرد ناقص است",
  unknown: "وضعیت دقیق مشخص نیست",
};

export const partConditionLabels: Record<
  string,
  string
> = {
  new: "نو",
  used: "کارکرده",
  refurbished: "بازسازی‌شده",
  tested: "تست‌شده",
  any: "هر وضعیت قابل بررسی",
};

function cleanValue(
  value: string,
): string {
  return value.trim();
}

function line(
  label: string,
  value: string | number | undefined,
): string | null {
  if (
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return `${label}: ${value}`;
}

function compactLines(
  lines: Array<string | null>,
): string[] {
  return lines.filter(
    (item): item is string =>
      item !== null,
  );
}

export function normalizePhone(
  phone: string,
): string {
  return phone
    .trim()
    .replace(/[^\d+]/g, "");
}

export function isValidIranianPhone(
  phone: string,
): boolean {
  const normalized =
    normalizePhone(phone);

  return (
    /^09\d{9}$/.test(normalized) ||
    /^\+989\d{9}$/.test(normalized) ||
    /^00989\d{9}$/.test(normalized) ||
    /^0\d{10}$/.test(normalized)
  );
}

export function validateBaseRequest(
  payload: BaseRequestPayload,
): string[] {
  const errors: string[] = [];

  if (cleanValue(payload.name).length < 2) {
    errors.push(
      "نام و نام خانوادگی را وارد کنید.",
    );
  }

  if (!isValidIranianPhone(payload.phone)) {
    errors.push(
      "شماره تماس معتبر وارد کنید.",
    );
  }

  if (cleanValue(payload.city).length < 2) {
    errors.push(
      "شهر را وارد کنید.",
    );
  }

  if (cleanValue(payload.description).length < 10) {
    errors.push(
      "شرح درخواست باید حداقل ۱۰ کاراکتر باشد.",
    );
  }

  return errors;
}

export function validateRepairRequest(
  payload: RepairRequestPayload,
): string[] {
  const errors =
    validateBaseRequest(payload);

  if (cleanValue(payload.machine).length < 2) {
    errors.push(
      "نوع یا سازنده دستگاه CNC را وارد کنید.",
    );
  }

  return errors;
}

export function validatePartRequest(
  payload: PartRequestPayload,
): string[] {
  const errors =
    validateBaseRequest(payload);

  if (cleanValue(payload.partName).length < 2) {
    errors.push(
      "نام یا نوع قطعه را وارد کنید.",
    );
  }

  if (
    !Number.isInteger(payload.quantity) ||
    payload.quantity < 1
  ) {
    errors.push(
      "تعداد قطعه باید حداقل ۱ باشد.",
    );
  }

  return errors;
}

export function buildRepairRequestText(
  payload: RepairRequestPayload,
): string {
  const lines = compactLines([
    "درخواست تعمیر CNC",
    "--------------------",

    line("نام", cleanValue(payload.name)),
    line(
      "شماره تماس",
      normalizePhone(payload.phone),
    ),
    line("شهر", cleanValue(payload.city)),

    line(
      "روش تماس ترجیحی",
      preferredContactLabels[
        payload.preferredContact
      ],
    ),

    "",
    line(
      "دستگاه",
      cleanValue(payload.machine),
    ),
    line(
      "مدل دستگاه",
      cleanValue(payload.machineModel),
    ),
    line(
      "کنترلر",
      cleanValue(payload.controller),
    ),
    line(
      "کد آلارم",
      cleanValue(payload.alarmCode),
    ),
    line(
      "تجهیز درگیر",
      cleanValue(payload.component),
    ),
    line(
      "وضعیت فعلی دستگاه",
      repairMachineStatusLabels[
        cleanValue(payload.machineStatus)
      ] ?? cleanValue(payload.machineStatus),
    ),

    "",
    line(
      "شرح خرابی",
      cleanValue(payload.description),
    ),
  ]);

  return lines.join("\n");
}

export function buildPartRequestText(
  payload: PartRequestPayload,
): string {
  const lines = compactLines([
    "درخواست قطعه CNC",
    "--------------------",

    line("نام", cleanValue(payload.name)),
    line(
      "شماره تماس",
      normalizePhone(payload.phone),
    ),
    line("شهر", cleanValue(payload.city)),

    line(
      "روش تماس ترجیحی",
      preferredContactLabels[
        payload.preferredContact
      ],
    ),

    "",
    line(
      "نام قطعه",
      cleanValue(payload.partName),
    ),
    line(
      "برند",
      cleanValue(payload.brand),
    ),
    line(
      "Part Number",
      cleanValue(payload.partNumber),
    ),
    line(
      "تعداد",
      payload.quantity,
    ),

    line(
      "دستگاه",
      cleanValue(payload.machine),
    ),
    line(
      "مدل دستگاه",
      cleanValue(payload.machineModel),
    ),

    line(
      "ترجیح وضعیت قطعه",
      partConditionLabels[
        cleanValue(
          payload.conditionPreference,
        )
      ] ??
        cleanValue(
          payload.conditionPreference,
        ),
    ),

    "",
    line(
      "توضیحات",
      cleanValue(payload.description),
    ),
  ]);

  return lines.join("\n");
}

export function buildRequestText(
  payload: ConversionRequestPayload,
): string {
  return payload.kind === "repair"
    ? buildRepairRequestText(payload)
    : buildPartRequestText(payload);
}