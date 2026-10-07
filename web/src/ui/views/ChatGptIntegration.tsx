import { publicChatGptListingUrl } from '../../config/chatGptListing'

export const chatGptInstallUrl = publicChatGptListingUrl(import.meta.env.VITE_ORGPORTAL_CHATGPT_LISTING_URL)

export function ChatGptIntegration() {
  return <section id="chatgpt" className="platform-chatgpt" aria-labelledby="chatgpt-title">
    <p className="platform-eyebrow">OrgPortal + ChatGPT</p>
    <h2 id="chatgpt-title">Your community, one conversation away.</h2>
    <p>Find your organizations and manage events from ChatGPT, using your existing OrgPortal account.</p>
    <ol className="platform-chatgpt-steps">
      <li><strong>Install</strong><span>Find OrgPortal in the ChatGPT directory.</span></li>
      <li><strong>Sign in</strong><span>Connect your account, continue with Google, and review the requested access.</span></li>
      <li><strong>Ask ChatGPT</strong><span>Try “Show my organizations” or “Help me update my event description.”</span></li>
    </ol>
    {chatGptInstallUrl
      ? <a className="btn-primary" href={chatGptInstallUrl}>Install OrgPortal in ChatGPT</a>
      : <p className="platform-account-note" role="status">Public installation is not available yet. These steps will be available after OrgPortal is published in the ChatGPT directory.</p>}
    <p className="platform-account-note">Your existing organization permissions apply. Event edits are previewed before you approve them.</p>
  </section>
}
