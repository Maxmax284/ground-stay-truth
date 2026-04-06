import { useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageSelector } from "@/components/LanguageSelector";
import { Shield, FileText, ArrowLeft } from "lucide-react";

const Legal = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const hash = location.hash.replace("#", "") || "privacy";

  useEffect(() => {
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }, [hash]);

  return (
    <div className="min-h-screen bg-background">
      <div className="thai-stripe" />
      <header className="h-14 flex items-center justify-between border-b border-border px-6 bg-card">
        <Link
          to="/"
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span
            className="text-lg font-bold text-foreground"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {t("auth.groundStay")}
          </span>
        </Link>
        <LanguageSelector compact />
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <Tabs defaultValue={hash === "terms" ? "terms" : "privacy"}>
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="privacy" className="gap-2">
              <Shield className="h-4 w-4" />
              {t("legal.privacyPolicy")}
            </TabsTrigger>
            <TabsTrigger value="terms" className="gap-2">
              <FileText className="h-4 w-4" />
              {t("legal.termsOfService")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="privacy">
            <Card>
              <CardContent className="prose prose-sm dark:prose-invert max-w-none pt-6 space-y-6">
                <h1 id="privacy" className="text-2xl font-bold">Privacy Policy</h1>
                <p className="text-muted-foreground text-sm">Last updated: February 2026</p>

                <h2 className="text-lg font-semibold">1. Information We Collect</h2>
                <p>We collect the following personal data when you create an account and use our platform:</p>
                <ul>
                  <li><strong>Identity data:</strong> Full name, email address, phone number</li>
                  <li><strong>Identity documents:</strong> Passport or ID photos uploaded for check-in verification</li>
                  <li><strong>Booking data:</strong> Reservation dates, unit preferences, guest count, special requests</li>
                  <li><strong>Communication data:</strong> Messages sent between you and our team</li>
                  <li><strong>Usage data:</strong> Language preferences stored in your browser's local storage</li>
                </ul>

                <h2 className="text-lg font-semibold">2. How We Use Your Data</h2>
                <ul>
                  <li><strong>Booking management:</strong> Processing reservations, check-ins, check-outs, and cancellations</li>
                  <li><strong>Communication:</strong> Facilitating messages between guests and staff, sending notifications about booking status changes</li>
                  <li><strong>Identity verification:</strong> Verifying uploaded ID documents using AI-powered analysis to ensure guest safety</li>
                  <li><strong>Translation services:</strong> Translating messages between languages using AI services to support multilingual communication</li>
                  <li><strong>Service requests:</strong> Managing maintenance reports and laundry requests during your stay</li>
                </ul>

                <h2 className="text-lg font-semibold">3. Data Retention</h2>
                <p>We retain your personal data for as long as your account is active. Booking records and associated communications are kept for a minimum of 2 years after check-out for operational and legal purposes. Identity documents are retained for 90 days after your stay concludes, after which they are permanently deleted.</p>

                <h2 className="text-lg font-semibold">4. Your Rights</h2>
                <p>You have the right to:</p>
                <ul>
                  <li><strong>Access</strong> your personal data through your profile page</li>
                  <li><strong>Correct</strong> inaccurate data by editing your profile</li>
                  <li><strong>Delete</strong> your account and all associated data using the account deletion feature in Settings → Profile → Danger Zone</li>
                  <li><strong>Data portability:</strong> Contact us to request a copy of your data in a structured format</li>
                </ul>
                <p>Account deletion permanently removes your profile, booking history, messages, uploaded documents, and all associated records. This action cannot be reversed.</p>

                <h2 className="text-lg font-semibold">5. Third-Party Services</h2>
                <p>We use the following third-party services that may process your data:</p>
                <ul>
                  <li><strong>AI translation services:</strong> Message content may be sent to AI providers for real-time translation. Messages are not stored by these providers beyond the processing period.</li>
                  <li><strong>AI document verification:</strong> Uploaded ID documents are analyzed by AI services for verification purposes. Images are processed in memory and not retained by the AI provider.</li>
                  <li><strong>AI assistant (Kru):</strong> General queries about bookings and operations are processed by AI services to provide advisory responses.</li>
                </ul>

                <h2 className="text-lg font-semibold">6. Legal Basis for Processing (GDPR)</h2>
                <p>We process your personal data under the following legal bases:</p>
                <ul>
                  <li><strong>Contract performance:</strong> Processing necessary to fulfill your booking (reservation management, payments, communication).</li>
                  <li><strong>Consent:</strong> You explicitly consent to data processing when creating an account. You may withdraw consent at any time by deleting your account.</li>
                  <li><strong>Legitimate interest:</strong> Fraud detection, security monitoring, and platform maintenance.</li>
                  <li><strong>Legal obligation:</strong> Retention of financial records as required by applicable tax and hospitality regulations.</li>
                </ul>

                <h2 className="text-lg font-semibold">7. International Data Transfers</h2>
                <p>Your data may be processed in countries outside your country of residence, including the United States, where our infrastructure and AI service providers operate. When your data is transferred internationally, we rely on:</p>
                <ul>
                  <li><strong>Standard Contractual Clauses (SCCs)</strong> approved by the European Commission for transfers from the EU/EEA.</li>
                  <li><strong>Adequacy decisions</strong> where available for the destination country.</li>
                  <li><strong>Contractual safeguards</strong> with all third-party processors requiring equivalent data protection standards.</li>
                </ul>
                <p>Specifically, data may be processed by AI service providers for translation, document verification, and assistant functionality. These providers process data in transit and do not retain personal data beyond the processing period.</p>

                <h2 className="text-lg font-semibold">8. Cookies &amp; Local Storage</h2>
                <p>We use browser local storage to save your language preference and authentication session. We do not use tracking cookies or third-party analytics trackers.</p>

                <h2 className="text-lg font-semibold">9. Contact &amp; Data Protection</h2>
                <p>For data requests, questions about this policy, to exercise your rights under GDPR, CCPA, or Thailand's PDPA, contact the property management team directly through the messaging system in your guest portal, or email us at the address provided during your booking confirmation.</p>
                <p>If you are in the European Union and are not satisfied with our response, you have the right to lodge a complaint with your local Data Protection Authority.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="terms">
            <Card>
              <CardContent className="prose prose-sm dark:prose-invert max-w-none pt-6 space-y-6">
                <h1 id="terms" className="text-2xl font-bold">Terms of Service</h1>
                <p className="text-muted-foreground text-sm">Last updated: February 2026</p>

                <h2 className="text-lg font-semibold">1. Booking &amp; Cancellation</h2>
                <p>All bookings are subject to the property's configurable cancellation policy, which is displayed on the Policies tab of your guest portal. Key terms:</p>
                <ul>
                  <li>Bookings begin as inquiries and must be approved by management before confirmation.</li>
                  <li>A deposit may be required within a specified deadline after approval. Failure to pay within the deadline may result in automatic cancellation.</li>
                  <li>Free cancellation is available up to a configured number of days before check-in. Partial refunds may apply for later cancellations. No refund is provided for same-day cancellations or no-shows.</li>
                  <li>Specific cancellation terms (days, percentages) are configured by the property and visible in your guest portal under Policies.</li>
                </ul>

                <h2 className="text-lg font-semibold">2. Check-in &amp; Check-out</h2>
                <ul>
                  <li>Valid government-issued photo ID must be uploaded before check-in can be completed.</li>
                  <li>Check-in and check-out times are set by the property and displayed in the Policies section.</li>
                  <li>Early check-in requests are subject to manager approval and cleaning buffer availability.</li>
                </ul>

                <h2 className="text-lg font-semibold">3. Guest Responsibilities</h2>
                <ul>
                  <li>Guests must comply with house rules specified for each accommodation unit.</li>
                  <li>Any damage to the property or its contents during your stay may result in charges.</li>
                  <li>Maintenance issues should be reported promptly through the Stay Support feature.</li>
                  <li>The number of guests staying must not exceed the unit's stated capacity.</li>
                </ul>

                <h2 className="text-lg font-semibold">4. Liability</h2>
                <ul>
                  <li>The property is not liable for personal belongings left in rooms or common areas.</li>
                  <li>The AI assistant (Kru) provides advisory information only and does not take actions on your behalf. Responses should not be treated as binding commitments.</li>
                  <li>AI-powered document verification is used to assist staff and does not constitute legal identity verification.</li>
                </ul>

                <h2 className="text-lg font-semibold">5. Account Termination</h2>
                <p>You may delete your account at any time through Settings → Profile → Danger Zone. The property reserves the right to suspend or terminate accounts that violate these terms, engage in fraudulent activity, or create safety concerns for staff or other guests.</p>

                <h2 className="text-lg font-semibold">6. Dispute Resolution</h2>
                <p>Any disputes should first be raised through the guest messaging system. If a resolution cannot be reached, disputes will be handled in accordance with the laws of the jurisdiction where the property operates.</p>

                <h2 className="text-lg font-semibold">7. Changes to These Terms</h2>
                <p>We may update these terms from time to time. Continued use of the platform after changes constitutes acceptance of the updated terms. Material changes will be communicated through the notification system.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Legal;
