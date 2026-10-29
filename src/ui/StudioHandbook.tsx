import { Modal } from './Dialogs';
import '../styles/handbook.css';

export function StudioHandbook({ onClose }: { onClose: () => void }) {
  return <Modal title="Studio handbook" onClose={onClose}>
    <article className="handbook" aria-label="Playing Lantern Works">
      <h3>A good first morning</h3>
      <p>Start with the guided first season. Meet a neighbour at the Window, look at their piece and check the price, work and deadline before taking it.</p>
      <p>You can give the proof your own direction. Leave room in the day for work already promised, then open the shop. Review the evening before tomorrow’s window.</p>
      <details>
        <summary>Finding your way</summary>
        <p><strong>Window</strong> is for meeting neighbours and making promises. <strong>Work</strong> shows the studio making them. <strong>Studio</strong> holds staffing, upgrades and your offers.</p>
        <p>The books explain cash and what is still owed. Payment arrives up front; it is earned when the work ships. Settings can show the tutorial again.</p>
      </details>
      <details>
        <summary>Keeping your seasons</summary>
        <p>The game tries to save after each move in this browser, on this device. Storage can fill up or be blocked. Private browsing and clearing site data can remove saves. Watch for save warnings.</p>
        <p>Choose <strong>Lantern Works</strong> in the top bar (the lamp icon on narrow screens) to return to the title. Under <strong>Your seasons</strong>, choose <strong>Keep replay</strong> beside a season, then <strong>Copy replay link</strong>. Keep the complete link somewhere safe as a backup. It includes your moves, artwork and text you put on prints.</p>
        <p>You can also copy a replay link from <strong>Keep a postcard or share this season</strong> at the ending. A postcard is a picture, not a replay backup. Very long histories may exceed the replay link limits.</p>
        <p>Open a replay link to look back. Choose <strong>Save a copy and continue</strong> for an unfinished season, or <strong>Keep a copy</strong> for a finished one. Opening the link alone does not save it.</p>
        <p>Saves do not sync between browsers or devices.</p>
      </details>
      <details>
        <summary>Playing offline</summary>
        <p>Your first visit needs a connection. Leave the game open while its files download; offline play depends on the browser keeping them. A cleared cache or interrupted download may mean reconnecting.</p>
        <p>The full game works without an account or API key. The in-game AI desk is simulated. Optional Claude drafting and debriefs are separate, need a connection and your own paid API access, and are never required to play.</p>
      </details>
      <details>
        <summary>A quieter, lighter studio</summary>
        <p>In Settings, choose <strong>Reduce motion</strong> or follow this device’s preference. Sound can be switched off, and Day speed changes how quickly the workday plays.</p>
        <p><strong>Illustrated studio</strong> uses less graphics power than the miniature room. Both views show the same season and choices. Automatic picks a view for your device.</p>
      </details>
      <details>
        <summary>If something goes wrong</summary>
        <p>If the room is slow or blank, try Illustrated studio in Settings. If a screen breaks, reload and check Your seasons for the last saved move. Unsaved moves may be lost.</p>
        <p>A diagnostic report can help describe a crash. Copying it keeps it on your device until you choose to share it. Avoid clearing site data when trying to recover a season.</p>
      </details>
      <footer className="handbook-colophon">
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><circle cx="16" cy="16" r="8" /><path d="M16 2v28M2 16h28" /></svg>
        <span>Lantern Works <span>Studio copy · Keep by the window</span></span>
      </footer>
    </article>
  </Modal>;
}
