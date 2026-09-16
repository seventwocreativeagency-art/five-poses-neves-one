# Deploy — NEVES ONE

Everything is in this folder. Nothing else to add.

## 1. Put it on GitHub

Open your `five-poses` repo. Select all existing files, delete them, commit.
Then **Add file** > **Upload files** and drag in the CONTENTS of this folder —
`app`, `lib`, `public`, `scripts`, `tests`, `package.json`, and the rest — so
they sit at the top level of the repo, not inside a wrapper folder. Commit.

Deleting first matters. Uploading on top of the old files is what broke the
build last time.

## 2. Environment variables in Vercel

Project > Settings > Environment Variables. You almost certainly have these
already; just confirm they are there.

| Variable | Needed for |
| --- | --- |
| `OPENAI_API_KEY` | All the GPT Image engines. Required. |
| `GEMINI_API_KEY` | The Gemini engine only. |
| `FAL_KEY` | The Seedream engine only. |
| `NEVES_ADMIN_TOKEN` | Optional. Any long random string. Switches on the model access checker. |

Apply each to Production, Preview and Development.

## 3. Deploy

Vercel builds automatically on commit. If you changed any environment variable,
go to Deployments and **Redeploy** the latest one, because those only take
effect on a fresh build.

Nothing to change under Settings > Functions. Fluid Compute is already on with
your Pro plan, which gives the 300 seconds Sunburst needs.

## 4. Check it

Open your app. You land on **NEVES ONE v2**: black and orange, NEVES logo.
Top right there is a **← Classic (v1)** button. Click it and you get your
original app exactly as it was, with an orange **NEVES ONE v2 →** button to
come back.

Both use the same key. Nothing to log into twice.

## 5. Before trusting it with client work

Confirm your OpenAI account can actually use Sunburst. With
`NEVES_ADMIN_TOKEN` set:

    https://your-app.vercel.app/api/diagnostics?token=YOUR_TOKEN&smoke=1

That makes one cheap real test image and tells you plainly whether it worked.
GPT Image models often need Organization Verification on your OpenAI account,
and it is better to find that out now than mid-job.

Then generate one image on each engine you plan to use.

## If anything goes wrong

Vercel > Deployments > the "..." menu on the last deployment that worked >
**Instant Rollback**. You are back up in about ten seconds.
