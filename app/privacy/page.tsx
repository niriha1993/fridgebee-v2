import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | fridgeBee",
  description: "Privacy Policy for fridgeBee.",
};

const updatedAt = "April 24, 2026";

export default function PrivacyPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#FDFAF5",
        color: "#1A1208",
        padding: "32px 20px 64px",
      }}
    >
      <div
        style={{
          maxWidth: 760,
          margin: "0 auto",
          background: "#FFFFFF",
          border: "1.5px solid #EDE5D8",
          borderRadius: 24,
          padding: "32px 24px",
          boxShadow: "0 20px 60px rgba(26,18,8,0.08)",
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <Link
            href="/"
            style={{
              color: "#B87A10",
              textDecoration: "none",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            ← Back to fridgeBee
          </Link>
        </div>

        <header style={{ marginBottom: 28 }}>
          <p
            style={{
              margin: 0,
              color: "#B87A10",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: ".08em",
              textTransform: "uppercase",
            }}
          >
            Privacy Policy
          </p>
          <h1
            style={{
              margin: "10px 0 8px",
              fontSize: "clamp(2rem, 4vw, 3rem)",
              lineHeight: 1.1,
            }}
          >
            How fridgeBee handles your data
          </h1>
          <p style={{ margin: 0, color: "#7A6B55", fontSize: 15, lineHeight: 1.7 }}>
            Last updated: {updatedAt}
          </p>
        </header>

        <section style={sectionStyle}>
          <p style={bodyStyle}>
            fridgeBee helps you track food in your kitchen, reduce waste, and get meal
            suggestions. This Privacy Policy explains what information we collect, how we
            use it, and the choices you have.
          </p>
        </section>

        <Section title="1. Information we collect">
          <p style={bodyStyle}>Depending on how you use fridgeBee, we may collect:</p>
          <ul style={listStyle}>
            <li>
              Account information such as your email address and authentication provider
              details when you sign in with Supabase Auth, Google, email/password, or magic
              link.
            </li>
            <li>
              App data such as fridge items, expiry dates, household member preferences,
              cuisines, and other settings you enter into the app.
            </li>
            <li>
              Images and text you submit for AI-powered features, such as scanning receipts,
              parsing food items, or generating meal ideas.
            </li>
            <li>
              Product usage and analytics data to understand app performance and improve the
              experience. This may include analytics tools configured by fridgeBee.
            </li>
            <li>
              Technical information such as device, browser, IP address, and log data
              generated when you access the service.
            </li>
          </ul>
        </Section>

        <Section title="2. How we use your information">
          <ul style={listStyle}>
            <li>Provide, maintain, and improve fridgeBee.</li>
            <li>Save your account, preferences, and kitchen data across sessions.</li>
            <li>Authenticate you securely and manage sign-in access.</li>
            <li>
              Run AI-assisted features such as food extraction, transcription, and recipe
              generation.
            </li>
            <li>Monitor reliability, prevent abuse, and protect the app.</li>
            <li>Communicate important product, security, or account-related updates.</li>
          </ul>
        </Section>

        <Section title="3. Where your data is stored">
          <p style={bodyStyle}>
            fridgeBee may store data in your device browser and in cloud services used to run
            the product. This can include:
          </p>
          <ul style={listStyle}>
            <li>Local browser storage for guest or demo mode.</li>
            <li>Supabase for authentication and user data storage.</li>
            <li>
              OpenAI for AI-powered features when you use scanning, text parsing, or meal
              generation features.
            </li>
            <li>Hosting, analytics, and operational infrastructure providers.</li>
          </ul>
        </Section>

        <Section title="4. AI features">
          <p style={bodyStyle}>
            If you use AI features, the text, images, and kitchen-related inputs you submit
            may be sent to third-party AI providers to generate responses or structured
            results. Please avoid uploading sensitive personal information that is not needed
            for the feature you are using.
          </p>
        </Section>

        <Section title="5. Sharing of information">
          <p style={bodyStyle}>
            We do not sell your personal information. We may share information with trusted
            service providers only as needed to operate fridgeBee, including authentication,
            hosting, analytics, database, storage, and AI service providers.
          </p>
        </Section>

        <Section title="6. Data retention">
          <p style={bodyStyle}>
            We keep information for as long as needed to provide the service, comply with
            legal obligations, resolve disputes, and enforce agreements. You can also clear
            locally stored guest data from your browser at any time.
          </p>
        </Section>

        <Section title="7. Your choices">
          <ul style={listStyle}>
            <li>You can choose whether to use guest mode or sign in.</li>
            <li>You can edit or delete information you add to the app.</li>
            <li>You can stop using AI-powered features at any time.</li>
            <li>
              You can request deletion or access using your published support or privacy
              contact channel.
            </li>
          </ul>
        </Section>

        <Section title="8. Children">
          <p style={bodyStyle}>
            fridgeBee is not intended for children to use independently. Household member data
            entered into the app should be limited to what is necessary for meal planning and
            food safety preferences.
          </p>
        </Section>

        <Section title="9. Changes to this policy">
          <p style={bodyStyle}>
            We may update this Privacy Policy from time to time. When we do, we will update
            the “Last updated” date on this page.
          </p>
        </Section>

        <Section title="10. Contact">
          <p style={bodyStyle}>
            If you have privacy questions, publish a support or privacy contact for fridgeBee
            before launch and update this section with that address.
          </p>
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={sectionStyle}>
      <h2 style={headingStyle}>{title}</h2>
      {children}
    </section>
  );
}

const sectionStyle = {
  marginTop: 24,
};

const headingStyle = {
  margin: "0 0 10px",
  fontSize: 22,
  lineHeight: 1.25,
};

const bodyStyle = {
  margin: 0,
  color: "#3E3428",
  fontSize: 15,
  lineHeight: 1.75,
};

const listStyle = {
  margin: "10px 0 0 20px",
  color: "#3E3428",
  fontSize: 15,
  lineHeight: 1.75,
  padding: 0,
};
