import { PrismaAdapter } from "@next-auth/prisma-adapter";
import * as GoogleProviderModule from "next-auth/providers/google";
import { prisma } from "./prisma";

const GoogleProvider =
  GoogleProviderModule.default?.default ||
  GoogleProviderModule.default;
const providers =
  process.env.APP_MODE === "local"
    ? []
    : [
        GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }),
      ];

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers,
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.credits = user.credits;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
};
