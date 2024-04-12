import { User } from "@app/lib/models/user";
import { MembershipInvitation } from "@app/lib/models/workspace";
import { generateModelSId } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const backfillUsers = async (execute: boolean) => {
  const users = await User.findAll({
    // @ts-expect-error sId is marked as required in the model, but we are looking for null values
    where: {
      sId: null,
    },
  });

  const chunks: User[][] = [];
  for (let i = 0; i < users.length; i += 16) {
    chunks.push(users.slice(i, i + 16));
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    await Promise.all(
      chunk.map((u) => {
        return (async () => {
          const sId = generateModelSId();
          logger.info(
            `Backfilling user ${u.id} with \`sId=${sId}\` [execute: ${execute}]`
          );

          if (execute) {
            await u.update({ sId });
          }
        })();
      })
    );
  }
};

const backfillInvitations = async (execute: boolean) => {
  const invitations = await MembershipInvitation.findAll({
    // @ts-expect-error sId is marked as required in the model, but we are looking for null values
    where: {
      sId: null,
    },
  });

  const chunks: MembershipInvitation[][] = [];
  for (let i = 0; i < invitations.length; i += 16) {
    chunks.push(invitations.slice(i, i + 16));
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    await Promise.all(
      chunk.map((i) => {
        return (async () => {
          const sId = generateModelSId();
          logger.info(
            `Backfilling invitation ${i.id} with \`sId=${sId}\` [execute: ${execute}]`
          );

          if (execute) {
            await i.update({ sId });
          }
        })();
      })
    );
  }
};

makeScript({}, async ({ execute }) => {
  await backfillUsers(execute);
  await backfillInvitations(execute);
});
