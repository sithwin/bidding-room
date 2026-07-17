export interface HumanVerifier {
  verify(token: string, remoteIp?: string): Promise<boolean>;
}
