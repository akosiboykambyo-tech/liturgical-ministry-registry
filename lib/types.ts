export type MemberStatus =
  | "Pending Verification"
  | "New"
  | "Renewed"
  | "Inactive";

export interface ArchivedDocument {
  document_url: string;
  uploaded_at: string | null;
  archived_at: string;
  expiration_date: string | null;
  ministry?: string | null;
}

export interface Member {
  id: string;
  uid: string;
  first_name: string;
  last_name: string;
  parish: string;
  ministries: string[];
  service_year: number;
  status: MemberStatus;
  document_url: string | null;
  notes: string | null;
  expiration_date: string | null;
  archived_documents: ArchivedDocument[];
  created_at: string;
  updated_at: string;
}

export interface MemberMinistry {
  id: string;
  member_id: string;
  ministry: string;
  status: MemberStatus;
  start_date: string | null;
  expiration_date: string | null;
  renewal_date: string | null;
  document_url: string | null;
  document_uploaded_at: string | null;
  archived_documents: ArchivedDocument[];
  created_at: string;
  updated_at: string;
}

export interface RecommendationRenewalBatch {
  id: string;
  parish: string;
  ministry: string | null;
  document_url: string;
  document_uploaded_at: string;
  renewal_date: string;
  next_renewal_date: string;
  notes: string | null;
  processed_by: string | null;
  processed_at: string;
  created_at: string;
}

export interface RecommendationRenewalMembership {
  id: string;
  batch_id: string;
  member_ministry_id: string | null;
  member_id: string | null;
  member_uid: string;
  member_name: string;
  parish: string;
  ministry: string;
  previous_status: MemberStatus | null;
  previous_start_date: string | null;
  previous_expiration_date: string | null;
  previous_renewal_date: string | null;
  previous_document_url: string | null;
  result_status: MemberStatus;
  result_expiration_date: string;
  result_renewal_date: string;
  result_document_url: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  member_id: string | null;
  admin_action: string;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  timestamp: string;
}

export interface DuplicateFlag {
  id: string;
  existing_member_id: string;
  incoming_first_name: string | null;
  incoming_last_name: string | null;
  incoming_parish: string | null;
  incoming_ministries: string[];
  incoming_data: Record<string, unknown>;
  resolved: boolean;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
}

export type DuplicateSource = "db" | "internal_batch";

export type DuplicateMatchType =
  | "exact"
  | "same_name_different_parish"
  | "similar_name"
  | "internal_batch_exact"
  | "internal_batch_fuzzy";

export interface StagedDuplicate {
  incoming: {
    first_name: string;
    last_name: string;
    parish: string;
    ministry: string;
  };
  existing: Member | null;
  matchType: DuplicateMatchType;
  similarity: number;
  source: DuplicateSource;
}

export interface ImportBatch {
  id: string;
  file_hash: string;
  file_name: string | null;
  row_count: number;
  unique_inserted: number;
  duplicates_routed: number;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export type CertificateElementType =
  | "text"
  | "member_name"
  | "parish"
  | "ministry"
  | "liturgical_year"
  | "uid"
  | "qr"
  | "image"
  | "signatory";

export interface CertificateElement {
  id: string;
  type: CertificateElementType;

  x: number;
  y: number;
  width: number;
  height: number;

  rotation?: number;

  text?: string;
  font_family?: string;
  font_size?: number;
  font_weight?: string;
  font_style?: string;
  text_case?: "normal" | "uppercase" | "small-caps";
  text_align?: "left" | "center" | "right" | "justify";

  color?: string;
  opacity?: number;

  image_url?: string;

  signatory_id?: string;
  /** Pixels by which the signature overlaps the printed name (default 12). */
  signature_offset?: number;
  /** 2 = explicit offset from the 12px-default signatory layout. */
  signature_offset_version?: 2;

  visible?: boolean;
  locked?: boolean;
  z_index?: number;
}
export interface CertificateTemplateSettings {
  template_url: string | null;
  name_x: number;
  name_y: number;
  parish_x: number;
  parish_y: number;
  ministry_x: number;
  ministry_y: number;
  year_x: number;
  year_y: number;
  qr_x: number;
  qr_y: number;
  qr_size: number;
  liturgical_year: string;
  font_family: string;
  secondary_font_family?: string;
  recipient_font_family?: string;
  recipient_font_color?: string;
  recipient_font_size?: number;
  recipient_font_weight?: string;
  recipient_text_case?: "normal" | "uppercase" | "small-caps";
  recipient_font_url?: string | null;
  recipient_font_name?: string | null;
  signatory_font_family?: string;
  signatory_font_color?: string;
  signatory_title_color?: string;
  signatory_title_font_family?: string;
  signatory_title_font_size?: number;
  signatory_title_font_weight?: string;
  signatory_title_text_case?: "normal" | "uppercase" | "small-caps";
  signatory_font_size?: number;
  signatory_font_weight?: string;
  signatory_text_case?: "normal" | "uppercase" | "small-caps";
  signatory_font_url?: string | null;
  signatory_font_name?: string | null;
  header_text: string;
  body_text: string;
  footer_text: string;

  // Layout is saved independently for every certificate template.
  orientation?: "portrait" | "landscape";
  paper_size?: "a4" | "letter";

  // Visual certificate designer
  canvas_width: number;
  canvas_height: number;
  elements: CertificateElement[];
}

export type SignatoryDisplayType = "static" | "dynamic";
export type SignatoryAlignment = "left" | "center" | "right";

export interface Signatory {
  id: string;
  name: string;
  title: string;
  signature_url: string | null;
  display_type: SignatoryDisplayType;
  ministry: string | null;
  position_x: number;
  position_y: number;
  width: number;
  alignment: SignatoryAlignment;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CertificateDownload {
  id: string;
  member_id: string;
  member_ministry_id: string | null;
  ministry: string | null;
  download_count: number;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      members: {
        Row: Member;
        Insert: Partial<Member>;
        Update: Partial<Member>;
      };
      member_ministries: {
        Row: MemberMinistry;
        Insert: Partial<MemberMinistry>;
        Update: Partial<MemberMinistry>;
      };
      recommendation_renewal_batches: {
        Row: RecommendationRenewalBatch;
        Insert: Partial<RecommendationRenewalBatch>;
        Update: Partial<RecommendationRenewalBatch>;
      };
      recommendation_renewal_memberships: {
        Row: RecommendationRenewalMembership;
        Insert: Partial<RecommendationRenewalMembership>;
        Update: Partial<RecommendationRenewalMembership>;
      };
      audit_logs: {
        Row: AuditLog;
        Insert: Partial<AuditLog>;
        Update: Partial<AuditLog>;
      };
      duplicate_flags: {
        Row: DuplicateFlag;
        Insert: Partial<DuplicateFlag>;
        Update: Partial<DuplicateFlag>;
      };
      system_settings: {
        Row: {
          key: string;
          value: Record<string, unknown>;
          is_default: boolean | null;
        };
        Insert: {
          key: string;
          value: Record<string, unknown>;
          is_default?: boolean;
        };
        Update: {
          value?: Record<string, unknown>;
          is_default?: boolean;
        };
      };
      signatories: {
        Row: Signatory;
        Insert: Partial<Signatory>;
        Update: Partial<Signatory>;
      };
      certificate_downloads: {
        Row: CertificateDownload;
        Insert: Partial<CertificateDownload>;
        Update: Partial<CertificateDownload>;
      };
    };
    Functions: {
      process_recommendation_renewal_batch: {
        Args: {
          p_batch_id: string;
          p_parish: string;
          p_ministry: string | null;
          p_document_url: string;
          p_renewal_date: string;
          p_next_renewal_date: string;
          p_membership_ids: string[];
          p_notes?: string | null;
        };
        Returns: string;
      };
    };
  };
}
