export type Segment =
  | "exhibition_booth"
  | "tendata_volume"
  | "distributor_by_country"
  | "met_in_person"
  | "inbound";

export type PipelineStage = "신규" | "접촉중" | "제안완료" | "계약완료";

export type SalesStatus =
  | "신규"
  | "1차발송"
  | "2차예정"
  | "회신옴"
  | "관심있음"
  | "미응답"
  | "제외"
  | "거래중"
  | "보류";

export interface Lead {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  country: string;
  segment: Segment;
  pipelineStage: PipelineStage;
  source: string | null;
  salesStatus: string | null;
  tags: string[];
  hasOpenedMail: boolean;
  hasReplied: boolean;
  mailSentCount: number;
  createdAt: string;
}
