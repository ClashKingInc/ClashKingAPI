# Inline shared base data

Requires DevKit migration 021. Images, votes and downloads are stored on the shared `bases` row; `base_images` and `base_votes` are removed. Personal saves stay in `user_saved_bases`.

Dashboard create/edit/read, mobile library reads, bot vote/remove-vote, legacy resolution and image staging now use the inline fields. Existing response shapes remain unchanged, so App, Dashboard and Bot clients do not require a contract migration. Voter identities are not added to public responses.

Images use ordered URLs (up to four), with internal empty slots supported during legacy staging. Votes use a user-ID keyed JSON object holding vote and its existing update timestamp. Downloads retain their immutable first-download map. SQL updates change only the relevant field/key, so votes cannot overwrite downloads or images.

Cutover must drain old base traffic, apply 021, deploy this API and resume traffic. Old base handlers cannot run against 021 because their tables are removed. The existing leaderboard rollout prerequisites for migration 020 still apply. No production migration or deployment is part of these commits.
