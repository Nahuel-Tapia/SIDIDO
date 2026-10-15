/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    user?: {
      id: string;
      username: string;
      fullName: string;
      role: 'admin' | 'operador' | 'consulta';
      email?: string | null;
    } | null;
    session?: {
      id: string;
      userId: string;
      expiresAt: Date;
    } | null;
  }
}
