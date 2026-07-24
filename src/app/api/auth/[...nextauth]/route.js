import * as NextAuthModule from "next-auth";
import { authOptions } from "@/lib/auth";

const NextAuth = NextAuthModule.default?.default || NextAuthModule.default;
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
