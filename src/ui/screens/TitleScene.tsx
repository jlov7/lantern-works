import { briefForProject } from '../../engine/design';
import { DesignedPrint } from '../creative/DesignedArtwork';
import bakery from '../neighbourhood/assets/bakery.webp';
import clem from '../atelier/assets/clem.webp';

const brief = briefForProject({ projectId: 'clem-ten', approach: 'first-night', scenarioId: 'main-street', eventDay: 11, contributors: ['Clem Jazz Bar', 'Moonrise Bakery'] });

/** An example of the same proof a player can make for a neighbour. */
export function TitleScene() {
  return <div className="title-scene" aria-hidden="true">
    <div className="title-scene__street"><img src={bakery} alt="" /><span>Down the street</span></div>
    <div className="title-scene__desk">
      <div className="title-scene__proof"><DesignedPrint piece={brief.defaultDesign.pieces[0]!} copy={brief.pieces[0]!.copy} compact /></div>
      <div className="title-scene__note"><span>From the studio</span><strong>A first night<br />for Clem</strong><small>A commission, made here.</small></div>
      <img className="title-scene__clem" src={clem} alt="" />
    </div>
  </div>;
}
