export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  type: 'access' | 'refresh';
  jti?: string;
}

export interface SessionToken {
  id: string;
  hash: string;
}

export interface SessionState {
  tokens: SessionToken[];
}
