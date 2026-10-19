export type ViewerHighlight = {
  id: string;
  dimension: string;
  page: number;
  quote: string;
  unverified?: boolean;
};

export type GlossaryEntry = { term: string; definition: string };
