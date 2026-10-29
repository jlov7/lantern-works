import type { CompanyState } from '../../engine/types';
import { careerIdentity } from '../game/careerIdentity';
import '../../styles/continuing-studio.css';

const outcome = { delivered: 'delivered', compromised: 'delivered with a refused change', partial: 'partly delivered', failed: 'not delivered', 'not-taken': 'not taken', unknown: 'historical outcome unknown' };

export function CareerProgress({ state }: { state: CompanyState }) {
  const career = careerIdentity(state);
  if (!career) return null;
  return <section className="career-progress" aria-label="Studio career">
    <p className="small">Season {state.config.continuation?.season ?? 1} · {career.stage === 'open' ? 'Recurring work' : 'Studio career'}</p>
    <h2>{career.complete ? 'The authored career is complete' : career.title}</h2>
    <p>{career.complete ? 'The studio’s opening, practice and legacy chapters are settled, including work that failed or was not taken. You can end here, or continue in open studio with recurring commissions and gatherings.' : career.line}</p>
    {career.stories.length > 0 && <details><summary>The studio’s commissions</summary><ul>{career.stories.map(story => {
      const [name, chapter] = story.nodeId.split('-');
      return <li key={story.nodeId}>{name === 'clem' ? 'Clem' : name === 'mara' ? 'Mara' : 'Hugo / Ivo'} · {chapter}: {outcome[story.outcome]}{story.season !== null ? ` (Season ${story.season})` : ''}.</li>;
    })}</ul></details>}
  </section>;
}
