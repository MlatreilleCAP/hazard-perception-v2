<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'
import { LANDING_FAQS, LANDING_FEATURES, LANDING_NAV_LINKS } from '@/app/landingFeatures'
import DemoCatalog from '@/components/landing/DemoCatalog.vue'
import FeatureVisual from '@/components/landing/FeatureVisual.vue'
import { useAuthStore } from '@/stores/authStore'

const auth = useAuthStore()
const router = useRouter()

async function signOut(): Promise<void> {
  await auth.signOut()
  await router.replace('/')
}
</script>

<template>
  <div class="landing-page">
    <div class="landing-grid" aria-hidden="true" />

    <header class="landing-header">
      <div class="landing-header-inner">
        <RouterLink to="/" class="landing-logo">
          <img src="/AD_Logo.svg" alt="AlertDriving" />
        </RouterLink>

        <nav class="landing-nav" aria-label="Primary">
          <a v-for="link in LANDING_NAV_LINKS" :key="link.href" :href="link.href">
            {{ link.label }}
          </a>
        </nav>

        <div class="landing-header-actions">
          <template v-if="auth.isSignedIn">
            <RouterLink to="/studio" class="landing-text-link">Studio</RouterLink>
            <button type="button" class="landing-signout" @click="signOut">Sign out</button>
          </template>
          <RouterLink v-else to="/login?next=/" class="landing-text-link">Sign in</RouterLink>
        </div>
      </div>
    </header>

    <main>
      <section class="landing-hero">
        <div class="landing-eyebrow landing-fade" style="--delay: 500ms">
          <span aria-hidden="true">✨</span>
          Build Safer Drivers With Coaching That Feels Personal.
        </div>

        <h1 class="landing-fade" style="--delay: 600ms">
          Turn Your
          <span class="landing-gradient">Drivers</span>
          Into Safer Decision-Makers — Automatically.
        </h1>

        <p class="landing-lede landing-fade" style="--delay: 700ms">
          Practice hazard perception, complete interactive lessons, and build safer
          habits with AI-powered driver coaching.
        </p>

        <div class="landing-hero-actions landing-fade" style="--delay: 800ms">
          <RouterLink to="/login?mode=signup&next=/" class="landing-demo-button">
            Request Demo
          </RouterLink>
        </div>

        <div id="how-it-works" class="landing-sizzle landing-fade" style="--delay: 1000ms">
          <div class="landing-sizzle-frame">
            <video
              class="demo-sizzle-video"
              src="/inroads_sizzle_reel_v1.mp4"
              poster="/demo-sizzle-poster.png"
              controls
              playsinline
              preload="metadata"
            >
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </section>

      <section id="demos" class="landing-demos">
        <div class="landing-demos-intro">
          <h2>
            Explore Every
            <span class="landing-gradient">Demo</span>
          </h2>
          <p>
            Interactive lessons and hazard perception scenarios in one place —
            browse the catalog and start training instantly.
          </p>
        </div>
        <DemoCatalog />
      </section>

      <section id="features" class="landing-features">
        <div class="landing-features-grid-bg" aria-hidden="true" />
        <div class="landing-features-inner">
          <div class="landing-features-intro">
            <h2>
              Features Designed To Help You Grow
              <span class="landing-gradient">Safer Drivers</span>
              Effortlessly
            </h2>
            <p>
              Everything you need to train, coach, and measure hazard perception —
              all in one place.
            </p>
          </div>

          <div class="feature-grid">
            <article v-for="feature in LANDING_FEATURES" :key="feature.title" class="feature-card">
              <div class="feature-card-visual">
                <FeatureVisual :kind="feature.visual" />
              </div>
              <div class="feature-card-copy">
                <h3>{{ feature.title }}</h3>
                <p>{{ feature.description }}</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section id="faq" class="landing-faq">
        <h2>FAQs</h2>
        <div class="faq-list">
          <details v-for="item in LANDING_FAQS" :key="item.q" class="faq-item">
            <summary>
              <span>{{ item.q }}</span>
              <span class="faq-plus" aria-hidden="true">+</span>
            </summary>
            <p>{{ item.a }}</p>
          </details>
        </div>
      </section>
    </main>

    <footer class="landing-footer">
      <div class="landing-footer-inner">
        <img src="/AD_Logo.svg" alt="AlertDriving" class="landing-footer-logo" />
        <p>AlertDriving Driver Coaching</p>
      </div>
    </footer>
  </div>
</template>
