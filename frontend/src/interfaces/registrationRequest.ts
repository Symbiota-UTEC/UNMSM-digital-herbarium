import { PaginatedResponse } from "@interfaces/utils/pagination";

import type { RegistrationStatus } from "@constants/enums";

export interface RegistrationRequest {
  registrationRequestId: string;
  username: string;
  email: string;
  institutionId: string;
  institutionName: string;
  fullName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  orcid?: string | null;
  phone?: string | null;
  address?: string | null;
  status: RegistrationStatus;
  createdAt: string;
  reviewedAt?: string | null;
  reviewedByUserId?: string | null;
  resultingUserId?: string | null;
}

export type RegistrationRequestPage = PaginatedResponse<RegistrationRequest>;
