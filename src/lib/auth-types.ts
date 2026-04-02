import { DefaultSession } from "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      shopId: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
    shopId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    shopId?: string;
  }
}
