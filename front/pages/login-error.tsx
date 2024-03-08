import { Button, Logo } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";

import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireAuth: false,
})<{
  domain: string | null;
  gaTrackingId: string;
  reason: string | null;
}>(async (context) => {
  return {
    props: {
      domain: (context.query.domain as string) ?? null,
      gaTrackingId: GA_TRACKING_ID,
      reason: (context.query.reason as string) ?? null,
    },
  };
});

function getErrorMessage(domain: string | null, reason: string | null) {
  if (domain) {
    return (
      <>
        The domain @{domain} attached to your email address is not authorized to
        join this workspace.
        <br />
        Please contact your workspace admin to get access or contact us at
        team@dust.tt for assistance.
      </>
    );
  }

  switch (reason) {
    case "unauthorized":
      return (
        <>
          Oops! Looks like you're not authorized to access this application yet.
          To gain access, please ask your workspace administrator to add you or
          your domain. Need more help? Email us at team@dust.tt.
        </>
      );

    default:
      return <>Please contact us at team@dust.tt for assistance.</>;
  }
}

export default function LoginError({
  domain,
  reason,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const errorMessage = getErrorMessage(domain, reason);

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50 bg-slate-800" />
      <main className="z-10 mx-6">
        <div className="container mx-auto sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl">
          <div style={{ height: "10vh" }}></div>
          <div className="grid grid-cols-1">
            <div>
              <Logo className="h-[48px] w-[192px] px-1" />
            </div>
            <p className="mt-16 font-objektiv text-4xl font-bold tracking-tighter text-slate-50 md:text-6xl">
              <span className="text-red-400 sm:font-objektiv md:font-objektiv">
                Secure AI assistant
              </span>{" "}
              <br />
              with your company’s knowledge
              <br />
            </p>
          </div>
          <div className="h-10"></div>
          <div>
            <p className="font-regular mb-8 text-slate-400">
              We could not process your sign up request!
            </p>
            <p className="font-regular mb-8 text-slate-400">{errorMessage}</p>
            <Link href="/">
              <Button variant="primary" label="Back to homepage" size="md" />
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
