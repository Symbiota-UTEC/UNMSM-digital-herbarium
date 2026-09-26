export interface UserProfileResponse {
  userId: string;
  username: string;
  email: string;
  isActive: boolean;
  isSuperuser: boolean;
  isInstitutionAdmin: boolean;
  institutionId: string;
  createdAt: string;
}
