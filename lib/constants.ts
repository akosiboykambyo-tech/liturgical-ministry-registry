import type { CertificateTemplateSettings } from "@/lib/types";
export const MINISTRIES = [
  "Mother Butler Guild",
  "Ministry of Greeters and Collectors",
  "Extraordinary Ministers of Holy Communion",
  "Ministry of Lectors and Commentators",
  "Ministry of Liturgical Music",
  "Ministry of Altar Servers",
] as const;

export type Ministry = (typeof MINISTRIES)[number];

export type MemberStatus =
  | "Pending Verification"
  | "New"
  | "Renewed"
  | "Inactive";

export const STATUS_VALUES: MemberStatus[] = [
  "Pending Verification",
  "New",
  "Renewed",
  "Inactive",
];

export const PARISHES = [
  "San Lorenzo & Companion Martyrs Parish",
  "St. Clare of Assisi Parish",
  "San Exequiel Moreno Parish",
  "Nuestra Señora de los Remedios Quasi-Parish",
  "San Ildefonso Parish",
  "Sagrada Familia Mission Station",
  "The Diocesan Shrine and Parish of San Jose de Navotas",
  "Pitong Gatang Mission Station",
  "Sto. Niño de Pasion Parish",
  "Parish of San Roque de Navotas",
  "San Andres Mangingisda Mission Station",
  "San Bartolome Parish",
  "The Diocesan Shrine and Parish of Immaculate Conception",
  "St. Jude Thaddeus Mission Station",
  "Sto. Niño Mission Station (San Bartolome)",
  "Sta. Cruz Parish",
  "Our Lady of the Poor Mission Station",
  "Exaltation of the Holy Cross Parish",
  "Sto. Rosario Parish",
  "Divine Mercy Spiritual Renewal Center",
  "San Juan Bautista Mission Station",
  "San Antonio de Padua Parish",
  "Our Lady of Peace Mission Station",
  "Nuestro Señor de Longos Mission Station",
  "Mary Help of Christians Parish",
  "St. Joseph The Workman Parish",
  "San Roque Cathedral Parish",
  "Sacred Heart of Jesus Mission Station",
  "Our Lady of Fatima Mission Station",
  "Two Hearts of Jesus & Mary Mission Station",
  "San Vicente Ferrer Mission Station",
  "Sacred Heart of Jesus Parish (Tugatog)",
  "Holy Cross Mission Station",
  "Holy Trinity Quasi-Parish",
  "Immaculate Heart of Mary Parish",
  "Karisma Ville Mission Station",
  "Santulan Mission Station",
  "Chapel of Our Lady of the Most Holy Rosary",
  "St. Gabriel The Archangel Parish",
  "Sto. Niño Mission Station (Sacred Heart)",
  "Sts. Peter & John Parish",
  "Sacred Heart of Jesus Parish (Morning Breeze)",
  "Our Lady of Lujan Parish",
  "Birhen ng Lourdes Parish",
  "Birhen ng Fatima Mission Station",
  "St. Francis of Assisi and Sta. Quiteria Parish",
  "Our Lady of the Sacred Heart Mission Station",
  "The Diocesan Shrine and Parish of Our Lady of Grace",
  "Sagrada Familia Parish",
  "San Jose Parish",
  "San Pancracio Parish",
  "Hearts of Jesus and Mary Parish",
] as const;

export function currentLiturgicalYear(): string {
  return String(new Date().getFullYear());
}

export type ExpirationStatus = "valid" | "expiring_soon" | "expired" | "none";

export const EXPIRING_SOON_DAYS = 30;

export function getExpirationStatus(expirationDate: string | null): ExpirationStatus {
  if (!expirationDate) return "none";
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(expirationDate + "T00:00:00");
  const diffMs = exp.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "expired";
  if (diffDays <= EXPIRING_SOON_DAYS) return "expiring_soon";
  return "valid";
}

export function shortMinistry(name: string): string {
  const map: Record<string, string> = {
    "Mother Butler Guild": "MBG",
    "Ministry of Greeters and Collectors": "MGC",
    "Extraordinary Ministers of Holy Communion": "EMHC",
    "Ministry of Lectors and Commentators": "MLC",
    "Ministry of Liturgical Music": "MLM",
    "Ministry of Altar Servers": "MAS",
  };
  return map[name] ?? name;
}

export const FONT_OPTIONS = [
  { label: "EB Garamond", value: "'EB Garamond', Georgia, serif" },
  { label: "Montserrat", value: "'Montserrat', sans-serif" },
  { label: "Playfair Display", value: "'Playfair Display', Georgia, serif" },
  { label: "Georgia (Default)", value: "Georgia, serif" },
] as const;

export const DEFAULT_TEMPLATE_SETTINGS: CertificateTemplateSettings = {
  template_url: null as string | null,
  name_x: 300,
  name_y: 340,
  parish_x: 300,
  parish_y: 395,
  ministry_x: 300,
  ministry_y: 430,
  year_x: 300,
  year_y: 470,
  qr_x: 460,
  qr_y: 740,
  qr_size: 90,
  liturgical_year: currentLiturgicalYear(),
  font_family: "Georgia, serif",
  header_text: "Diocese of Navotas",
  body_text: "This is to certify that",
  footer_text: "has been duly commissioned as a liturgical minister",

  // Visual certificate designer
  canvas_width: 600,
  canvas_height: 850,
  elements: [
    {
      id: "header",
      type: "text",
      x: 300,
      y: 70,
      width: 520,
      height: 40,
      text: "Diocese of Navotas",
      font_family: "Georgia, serif",
      font_size: 24,
      font_weight: "bold",
      text_align: "center",
      color: "#1a1a2e",
      z_index: 10,
    },
    {
      id: "body",
      type: "text",
      x: 300,
      y: 290,
      width: 520,
      height: 35,
      text: "This is to certify that",
      font_family: "Georgia, serif",
      font_size: 14,
      text_align: "center",
      color: "#3f3f46",
      z_index: 10,
    },
    {
      id: "member-name",
      type: "member_name",
      x: 300,
      y: 340,
      width: 520,
      height: 45,
      font_family: "Georgia, serif",
      font_size: 20,
      text_align: "center",
      color: "#0f172a",
      z_index: 10,
    },
    {
      id: "parish",
      type: "parish",
      x: 300,
      y: 395,
      width: 520,
      height: 35,
      font_family: "Georgia, serif",
      font_size: 14,
      text_align: "center",
      color: "#3f3f46",
      z_index: 10,
    },
    {
      id: "ministry",
      type: "ministry",
      x: 300,
      y: 430,
      width: 520,
      height: 35,
      font_family: "Georgia, serif",
      font_size: 14,
      text_align: "center",
      color: "#3f3f46",
      z_index: 10,
    },
    {
      id: "liturgical-year",
      type: "liturgical_year",
      x: 300,
      y: 470,
      width: 520,
      height: 35,
      font_family: "Georgia, serif",
      font_size: 16,
      font_weight: "bold",
      text_align: "center",
      color: "#b8071a",
      z_index: 10,
    },
    {
      id: "footer",
      type: "text",
      x: 300,
      y: 505,
      width: 520,
      height: 35,
      text: "has been duly commissioned as a liturgical minister",
      font_family: "Georgia, serif",
      font_size: 12,
      font_style: "italic",
      text_align: "center",
      color: "#52525b",
      z_index: 10,
    },
    {
      id: "qr",
      type: "qr",
      x: 460,
      y: 740,
      width: 90,
      height: 90,
      z_index: 20,
    },
  ],
};
