import type { WithAPIErrorReponse } from "@dust-tt/types";
import { IncomingForm } from "formidable";
import type { NextApiRequest, NextApiResponse } from "next";

import { apiError, withLogging } from "@app/logger/withlogging";

const { EMAIL_WEBHOOK_SECRET = "" } = process.env;

export type GetResponseBody = {
  success: boolean;
  message?: string;
};

export const config = {
  api: {
    bodyParser: false, // Disabling Next.js's body parser as formidable has its own
  },
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<GetResponseBody>>
): Promise<void> {
  switch (req.method) {
    case "POST":
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Basic ")) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "missing_authorization_header_error",
            message: "Missing Authorization header",
          },
        });
      }

      const base64Credentials = authHeader.split(" ")[1];
      const credentials = Buffer.from(base64Credentials, "base64").toString(
        "ascii"
      );
      const [username, password] = credentials.split(":");

      if (username !== "sendgrid" || password !== EMAIL_WEBHOOK_SECRET) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "invalid_basic_authorization_error",
            message: "Invalid Authorization header",
          },
        });
      }

      const form = new IncomingForm();
      const [fields] = await form.parse(req);

      let text: string | null = null;
      let SPF: string | null = null;
      let dkim: string | null = null;
      let to: string[] | null = null;
      let cc: string[] | null = null;
      let from: string | null = null;

      try {
        text = fields["text"] ? fields["text"][0] : null;
        SPF = fields["SPF"] ? fields["SPF"][0] : null;
        dkim = fields["dkim"] ? fields["dkim"][0] : null;
        const envelope = fields["envelope"]
          ? JSON.parse(fields["envelope"][0])
          : null;

        if (envelope) {
          to = envelope.to || null;
          cc = envelope.cc || [];
          from = envelope.from || [];
        }
      } catch (e) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "invalid_request_error",
            message: "Failed to parse email content",
          },
        });
      }

      if (!text || !SPF || !dkim || !from) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "invalid_request_error",
            message: "Missing required email fields",
          },
        });
      }

      // Check SPF is pass.
      if (SPF !== "pass") {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "invalid_request_error",
            message: "SPF validation failed",
          },
        });
      }

      // Check dkim is pass.
      if (dkim !== `{@${from.split("@")[1]} : pass}`) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "invalid_request_error",
            message: "dkim validation failed",
          },
        });
      }

      console.log({ text, SPF, dkim, to, from, cc });

      return res.status(200).json({ success: true });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
