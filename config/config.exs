# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :manavault,
  admin_password_hash: nil,
  auth_disabled: false,
  auth_rate_limit: [
    window_ms: :timer.minutes(15),
    max_attempts_per_ip: 5,
    max_attempts_global: 30,
    permanent_ban_after_failures: 30
  ],
  # When behind a trusted reverse proxy, derive the auth rate-limit client id
  # from the forwarded header instead of the (shared) proxy peer IP.
  trust_proxy_headers: false,
  forwarded_ip_header: "x-forwarded-for",
  # Session cookie hardening. Enable secure_cookies when served over HTTPS so
  # the auth cookie is never sent over plaintext. Defaults preserve the prior
  # behaviour (not secure, 180-day lifetime).
  secure_cookies: false,
  session_max_age_days: 180,
  ecto_repos: [Manavault.Repo],
  generators: [timestamp_type: :utc_datetime]

# SQLite transactions default to BEGIN DEFERRED: they start as readers and
# upgrade to the database-wide write lock at the first write. When another
# writer holds the lock, that upgrade fails immediately with SQLITE_BUSY —
# busy_timeout never applies to lock upgrades. Immediate mode takes the write
# lock at BEGIN, so concurrent transactions queue (up to busy_timeout) instead
# of erroring, and WAL keeps reads unblocked alongside the writer.
config :manavault, Manavault.Repo,
  default_transaction_mode: :immediate,
  busy_timeout: 5_000

# Configure the endpoint
config :manavault, ManavaultWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [html: ManavaultWeb.ErrorHTML, json: ManavaultWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: Manavault.PubSub

# Configure the mailer
#
# By default it uses the "Local" adapter which stores the emails
# locally. You can see the emails in your browser, at "/dev/mailbox".
#
# For production it's recommended to configure a different adapter
# at the `config/runtime.exs`.
config :manavault, Manavault.Mailer, adapter: Swoosh.Adapters.Local

# Configure tailwind (the version is required)
config :tailwind,
  version: "4.3.0",
  manavault: [
    args: ~w(
      --input=assets/css/app.css
      --output=priv/static/assets/css/app.css
    ),
    cd: Path.expand("..", __DIR__),
    env: %{"NODE_PATH" => Mix.Project.build_path()}
  ]

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

config :phoenix, :filter_parameters, ["password", "imageData", "image_data"]

config :manavault, Manavault.Cache,
  gc_interval: :timer.hours(12),
  gc_memory_check_interval: :timer.seconds(10),
  max_size: 100_000

# Public share preview PNGs are immutable, content-addressed artifacts. The
# supervised renderer admits at most two concurrent renders across all keys;
# only the 500 newest completed artifacts are retained.
config :manavault, ManavaultWeb.DeckSharePreview.ArtifactCache,
  cache_dir: Path.join(System.tmp_dir!(), "manavault/share-previews"),
  max_concurrency: 2,
  max_artifacts: 500,
  assets_version: "scryfall-symbols-v1",
  renderer_version: "rsvg-convert"

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
