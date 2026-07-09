import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_roles" AS ENUM('admin', 'editor', 'user');
  CREATE TYPE "public"."enum_media_r2_backup_status" AS ENUM('pending', 'success', 'error');
  CREATE TYPE "public"."enum_pages_category" AS ENUM('Místo k navštívení', 'Turistický cíl', 'Místa', 'Praktické informace', 'Vstupní podmínky', 'Cesta', 'Počasí', 'Doprava', 'Měna a ceny', 'Zdraví a bezpečí', 'Jazyk a kultura', 'Jídlo a pití', 'Ubytování', 'Články', 'Rubrika', 'Statická stránka');
  CREATE TYPE "public"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_version_category" AS ENUM('Místo k navštívení', 'Turistický cíl', 'Místa', 'Praktické informace', 'Vstupní podmínky', 'Cesta', 'Počasí', 'Doprava', 'Měna a ceny', 'Zdraví a bezpečí', 'Jazyk a kultura', 'Jídlo a pití', 'Ubytování', 'Články', 'Rubrika', 'Statická stránka');
  CREATE TYPE "public"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_articles_category" AS ENUM('Článek', 'Průvodce', 'RadyNaCestu');
  CREATE TYPE "public"."enum_comments_type" AS ENUM('comment', 'review');
  CREATE TYPE "public"."enum_comments_status" AS ENUM('published', 'spam');
  CREATE TYPE "public"."enum_transactions_category" AS ENUM('tourist_point_reward', 'place_to_visit_reward', 'practical_information_reward', 'article_reward', 'review_reward', 'comment_reward', 'bonus', 'withdrawal');
  CREATE TABLE "users_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_users_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"legacy_user_id" numeric,
  	"username" varchar,
  	"first_name" varchar,
  	"last_name" varchar,
  	"description" varchar,
  	"my_web_url" varchar,
  	"avatar_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar,
  	"is_creative_commons" boolean DEFAULT false,
  	"author" varchar,
  	"source" varchar,
  	"source_link" varchar,
  	"creative_commons_license" varchar,
  	"r2_backup_status" "enum_media_r2_backup_status" DEFAULT 'pending',
  	"cloudinary_public_id" varchar,
  	"cloudinary_url" varchar,
  	"cloudinary_resource_type" varchar,
  	"cloudinary_format" varchar,
  	"cloudinary_version" numeric,
  	"original_url" varchar,
  	"transformed_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "pages_breadcrumbs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"doc_id" integer,
  	"url" varchar,
  	"label" varchar
  );
  
  CREATE TABLE "pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"category" "enum_pages_category" DEFAULT 'Místo k navštívení',
  	"featured_image_image_id" integer,
  	"featured_image_feature_image_style_css" varchar,
  	"featured_image_cloudinary_setting" varchar,
  	"text" jsonb,
  	"detail_google_maps_address" varchar,
  	"detail_latitude" varchar,
  	"detail_longitude" varchar,
  	"detail_website" varchar,
  	"detail_google_maps_zoom" numeric DEFAULT 10,
  	"detail_locative" varchar,
  	"detail_genitive" varchar,
  	"detail_timezone" varchar,
  	"detail_currency_code" varchar,
  	"detail_show_weather" boolean DEFAULT false,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"affiliate_tours_url" varchar,
  	"affiliate_accommodation_url" varchar,
  	"affiliate_car_rental_url" varchar,
  	"affiliate_kiwi_iata_code" varchar,
  	"slug" varchar,
  	"legacy_page_id" numeric,
  	"created_by_id" integer,
  	"parent_id" integer,
  	"full_slug" varchar,
  	"include_in_child_url_paths" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_pages_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_pages_v_version_breadcrumbs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"doc_id" integer,
  	"url" varchar,
  	"label" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_category" "enum__pages_v_version_category" DEFAULT 'Místo k navštívení',
  	"version_featured_image_image_id" integer,
  	"version_featured_image_feature_image_style_css" varchar,
  	"version_featured_image_cloudinary_setting" varchar,
  	"version_text" jsonb,
  	"version_detail_google_maps_address" varchar,
  	"version_detail_latitude" varchar,
  	"version_detail_longitude" varchar,
  	"version_detail_website" varchar,
  	"version_detail_google_maps_zoom" numeric DEFAULT 10,
  	"version_detail_locative" varchar,
  	"version_detail_genitive" varchar,
  	"version_detail_timezone" varchar,
  	"version_detail_currency_code" varchar,
  	"version_detail_show_weather" boolean DEFAULT false,
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_affiliate_tours_url" varchar,
  	"version_affiliate_accommodation_url" varchar,
  	"version_affiliate_car_rental_url" varchar,
  	"version_affiliate_kiwi_iata_code" varchar,
  	"version_slug" varchar,
  	"version_legacy_page_id" numeric,
  	"version_created_by_id" integer,
  	"version_parent_id" integer,
  	"version_full_slug" varchar,
  	"version_include_in_child_url_paths" boolean DEFAULT true,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__pages_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "articles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"category" "enum_articles_category" DEFAULT 'Článek' NOT NULL,
  	"featured_image_image_id" integer,
  	"featured_image_feature_image_style_css" varchar,
  	"featured_image_cloudinary_setting" varchar,
  	"text" jsonb,
  	"attribution" jsonb,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"slug" varchar,
  	"published_at" timestamp(3) with time zone,
  	"legacy_article_id" numeric,
  	"created_by_id" integer,
  	"main_page_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "articles_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"pages_id" integer
  );
  
  CREATE TABLE "comments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"type" "enum_comments_type" DEFAULT 'comment' NOT NULL,
  	"rating" numeric,
  	"body" varchar NOT NULL,
  	"author_name" varchar NOT NULL,
  	"author_id" integer,
  	"status" "enum_comments_status" DEFAULT 'published' NOT NULL,
  	"commented_at" timestamp(3) with time zone,
  	"legacy_comment_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "comments_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"articles_id" integer,
  	"pages_id" integer
  );
  
  CREATE TABLE "transactions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"user_id" integer NOT NULL,
  	"category" "enum_transactions_category" NOT NULL,
  	"amount" numeric NOT NULL,
  	"note" varchar,
  	"transacted_at" timestamp(3) with time zone,
  	"legacy_transaction_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "transactions_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"pages_id" integer,
  	"articles_id" integer,
  	"comments_id" integer
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"media_id" integer,
  	"pages_id" integer,
  	"articles_id" integer,
  	"comments_id" integer,
  	"transactions_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "homepage" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "header_nav_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"link" varchar NOT NULL
  );
  
  CREATE TABLE "header" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"logo_link_title" varchar,
  	"logo_link_href" varchar,
  	"logo_link_is_external" boolean DEFAULT false,
  	"logo_link_is_button_link" boolean DEFAULT false,
  	"logo_image_id" integer,
  	"logo_svg_code" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "footer_nav_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "footer" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"logo_link_title" varchar,
  	"logo_link_href" varchar,
  	"logo_link_is_external" boolean DEFAULT false,
  	"logo_link_is_button_link" boolean DEFAULT false,
  	"logo_image_id" integer,
  	"logo_svg_code" varchar,
  	"copyright_text" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "users_roles" ADD CONSTRAINT "users_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users" ADD CONSTRAINT "users_avatar_id_media_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_breadcrumbs" ADD CONSTRAINT "pages_breadcrumbs_doc_id_pages_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_breadcrumbs" ADD CONSTRAINT "pages_breadcrumbs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_featured_image_image_id_media_id_fk" FOREIGN KEY ("featured_image_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_version_breadcrumbs" ADD CONSTRAINT "_pages_v_version_breadcrumbs_doc_id_pages_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_version_breadcrumbs" ADD CONSTRAINT "_pages_v_version_breadcrumbs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_featured_image_image_id_media_id_fk" FOREIGN KEY ("version_featured_image_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_parent_id_pages_id_fk" FOREIGN KEY ("version_parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_featured_image_image_id_media_id_fk" FOREIGN KEY ("featured_image_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_main_page_id_pages_id_fk" FOREIGN KEY ("main_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "comments_rels" ADD CONSTRAINT "comments_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "comments_rels" ADD CONSTRAINT "comments_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "comments_rels" ADD CONSTRAINT "comments_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "transactions_rels" ADD CONSTRAINT "transactions_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "transactions_rels" ADD CONSTRAINT "transactions_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "transactions_rels" ADD CONSTRAINT "transactions_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "transactions_rels" ADD CONSTRAINT "transactions_rels_comments_fk" FOREIGN KEY ("comments_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_comments_fk" FOREIGN KEY ("comments_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_transactions_fk" FOREIGN KEY ("transactions_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "header_nav_items" ADD CONSTRAINT "header_nav_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "header" ADD CONSTRAINT "header_logo_image_id_media_id_fk" FOREIGN KEY ("logo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "footer_nav_items" ADD CONSTRAINT "footer_nav_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "footer" ADD CONSTRAINT "footer_logo_image_id_media_id_fk" FOREIGN KEY ("logo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "users_roles_order_idx" ON "users_roles" USING btree ("order");
  CREATE INDEX "users_roles_parent_idx" ON "users_roles" USING btree ("parent_id");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "users_legacy_user_id_idx" ON "users" USING btree ("legacy_user_id");
  CREATE INDEX "users_username_idx" ON "users" USING btree ("username");
  CREATE INDEX "users_avatar_idx" ON "users" USING btree ("avatar_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "pages_breadcrumbs_order_idx" ON "pages_breadcrumbs" USING btree ("_order");
  CREATE INDEX "pages_breadcrumbs_parent_id_idx" ON "pages_breadcrumbs" USING btree ("_parent_id");
  CREATE INDEX "pages_breadcrumbs_doc_idx" ON "pages_breadcrumbs" USING btree ("doc_id");
  CREATE INDEX "pages_featured_image_featured_image_image_idx" ON "pages" USING btree ("featured_image_image_id");
  CREATE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");
  CREATE UNIQUE INDEX "pages_legacy_page_id_idx" ON "pages" USING btree ("legacy_page_id");
  CREATE INDEX "pages_created_by_idx" ON "pages" USING btree ("created_by_id");
  CREATE INDEX "pages_parent_idx" ON "pages" USING btree ("parent_id");
  CREATE INDEX "pages_full_slug_idx" ON "pages" USING btree ("full_slug");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  CREATE INDEX "pages__status_idx" ON "pages" USING btree ("_status");
  CREATE INDEX "_pages_v_version_breadcrumbs_order_idx" ON "_pages_v_version_breadcrumbs" USING btree ("_order");
  CREATE INDEX "_pages_v_version_breadcrumbs_parent_id_idx" ON "_pages_v_version_breadcrumbs" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_version_breadcrumbs_doc_idx" ON "_pages_v_version_breadcrumbs" USING btree ("doc_id");
  CREATE INDEX "_pages_v_parent_idx" ON "_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_featured_image_version_featured_image_i_idx" ON "_pages_v" USING btree ("version_featured_image_image_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "_pages_v" USING btree ("version_slug");
  CREATE INDEX "_pages_v_version_version_legacy_page_id_idx" ON "_pages_v" USING btree ("version_legacy_page_id");
  CREATE INDEX "_pages_v_version_version_created_by_idx" ON "_pages_v" USING btree ("version_created_by_id");
  CREATE INDEX "_pages_v_version_version_parent_idx" ON "_pages_v" USING btree ("version_parent_id");
  CREATE INDEX "_pages_v_version_version_full_slug_idx" ON "_pages_v" USING btree ("version_full_slug");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "_pages_v" USING btree ("version__status");
  CREATE INDEX "_pages_v_created_at_idx" ON "_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_latest_idx" ON "_pages_v" USING btree ("latest");
  CREATE INDEX "articles_featured_image_featured_image_image_idx" ON "articles" USING btree ("featured_image_image_id");
  CREATE INDEX "articles_slug_idx" ON "articles" USING btree ("slug");
  CREATE UNIQUE INDEX "articles_legacy_article_id_idx" ON "articles" USING btree ("legacy_article_id");
  CREATE INDEX "articles_created_by_idx" ON "articles" USING btree ("created_by_id");
  CREATE INDEX "articles_main_page_idx" ON "articles" USING btree ("main_page_id");
  CREATE INDEX "articles_updated_at_idx" ON "articles" USING btree ("updated_at");
  CREATE INDEX "articles_created_at_idx" ON "articles" USING btree ("created_at");
  CREATE INDEX "articles_rels_order_idx" ON "articles_rels" USING btree ("order");
  CREATE INDEX "articles_rels_parent_idx" ON "articles_rels" USING btree ("parent_id");
  CREATE INDEX "articles_rels_path_idx" ON "articles_rels" USING btree ("path");
  CREATE INDEX "articles_rels_pages_id_idx" ON "articles_rels" USING btree ("pages_id");
  CREATE INDEX "comments_label_idx" ON "comments" USING btree ("label");
  CREATE INDEX "comments_author_idx" ON "comments" USING btree ("author_id");
  CREATE INDEX "comments_status_idx" ON "comments" USING btree ("status");
  CREATE UNIQUE INDEX "comments_legacy_comment_id_idx" ON "comments" USING btree ("legacy_comment_id");
  CREATE INDEX "comments_updated_at_idx" ON "comments" USING btree ("updated_at");
  CREATE INDEX "comments_created_at_idx" ON "comments" USING btree ("created_at");
  CREATE INDEX "comments_rels_order_idx" ON "comments_rels" USING btree ("order");
  CREATE INDEX "comments_rels_parent_idx" ON "comments_rels" USING btree ("parent_id");
  CREATE INDEX "comments_rels_path_idx" ON "comments_rels" USING btree ("path");
  CREATE INDEX "comments_rels_articles_id_idx" ON "comments_rels" USING btree ("articles_id");
  CREATE INDEX "comments_rels_pages_id_idx" ON "comments_rels" USING btree ("pages_id");
  CREATE INDEX "transactions_label_idx" ON "transactions" USING btree ("label");
  CREATE INDEX "transactions_user_idx" ON "transactions" USING btree ("user_id");
  CREATE INDEX "transactions_category_idx" ON "transactions" USING btree ("category");
  CREATE INDEX "transactions_transacted_at_idx" ON "transactions" USING btree ("transacted_at");
  CREATE UNIQUE INDEX "transactions_legacy_transaction_id_idx" ON "transactions" USING btree ("legacy_transaction_id");
  CREATE INDEX "transactions_updated_at_idx" ON "transactions" USING btree ("updated_at");
  CREATE INDEX "transactions_created_at_idx" ON "transactions" USING btree ("created_at");
  CREATE INDEX "transactions_rels_order_idx" ON "transactions_rels" USING btree ("order");
  CREATE INDEX "transactions_rels_parent_idx" ON "transactions_rels" USING btree ("parent_id");
  CREATE INDEX "transactions_rels_path_idx" ON "transactions_rels" USING btree ("path");
  CREATE INDEX "transactions_rels_pages_id_idx" ON "transactions_rels" USING btree ("pages_id");
  CREATE INDEX "transactions_rels_articles_id_idx" ON "transactions_rels" USING btree ("articles_id");
  CREATE INDEX "transactions_rels_comments_id_idx" ON "transactions_rels" USING btree ("comments_id");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_articles_id_idx" ON "payload_locked_documents_rels" USING btree ("articles_id");
  CREATE INDEX "payload_locked_documents_rels_comments_id_idx" ON "payload_locked_documents_rels" USING btree ("comments_id");
  CREATE INDEX "payload_locked_documents_rels_transactions_id_idx" ON "payload_locked_documents_rels" USING btree ("transactions_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");
  CREATE INDEX "header_nav_items_order_idx" ON "header_nav_items" USING btree ("_order");
  CREATE INDEX "header_nav_items_parent_id_idx" ON "header_nav_items" USING btree ("_parent_id");
  CREATE INDEX "header_logo_logo_image_idx" ON "header" USING btree ("logo_image_id");
  CREATE INDEX "footer_nav_items_order_idx" ON "footer_nav_items" USING btree ("_order");
  CREATE INDEX "footer_nav_items_parent_id_idx" ON "footer_nav_items" USING btree ("_parent_id");
  CREATE INDEX "footer_logo_logo_image_idx" ON "footer" USING btree ("logo_image_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_roles" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "pages_breadcrumbs" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "_pages_v_version_breadcrumbs" CASCADE;
  DROP TABLE "_pages_v" CASCADE;
  DROP TABLE "articles" CASCADE;
  DROP TABLE "articles_rels" CASCADE;
  DROP TABLE "comments" CASCADE;
  DROP TABLE "comments_rels" CASCADE;
  DROP TABLE "transactions" CASCADE;
  DROP TABLE "transactions_rels" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "homepage" CASCADE;
  DROP TABLE "header_nav_items" CASCADE;
  DROP TABLE "header" CASCADE;
  DROP TABLE "footer_nav_items" CASCADE;
  DROP TABLE "footer" CASCADE;
  DROP TYPE "public"."enum_users_roles";
  DROP TYPE "public"."enum_media_r2_backup_status";
  DROP TYPE "public"."enum_pages_category";
  DROP TYPE "public"."enum_pages_status";
  DROP TYPE "public"."enum__pages_v_version_category";
  DROP TYPE "public"."enum__pages_v_version_status";
  DROP TYPE "public"."enum_articles_category";
  DROP TYPE "public"."enum_comments_type";
  DROP TYPE "public"."enum_comments_status";
  DROP TYPE "public"."enum_transactions_category";`)
}
