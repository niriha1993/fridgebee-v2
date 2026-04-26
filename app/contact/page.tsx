import type { Metadata } from "next";
import ContactForm from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact | FridgeBee — Send feedback or report a bug",
  description:
    "Get in touch with the FridgeBee team. Send feedback, report a bug, or suggest a feature. We read every message.",
};

export default function ContactPage() {
  return <ContactForm />;
}
