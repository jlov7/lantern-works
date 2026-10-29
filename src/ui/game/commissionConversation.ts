import { nightCalendar, projectFor } from '../../engine/projects';
import { CAST_BY_ID } from '../../engine/rules';
import type { CompanyState, ProjectId } from '../../engine/types';
import { commissionInspiration, intentionFor } from './creativeRecognition';

export function commissionConversation(state: CompanyState, id: ProjectId) {
  const project = projectFor(state, id);
  const returning = project.stage ? project.stage === 'practice' : !!state.config.continuation;
  const ivo = project.castId === 'ivo';
  const calendar = nightCalendar(state);
  const previous = state.config.continuation?.relationships.find(r => r.castId === project.castId)?.milestone;
  const clemMemory = previous?.outcome === 'delivered' ? previous.approach === 'first-night' ? 'You kept the old lettering last time. I still notice it when I open up. ' : 'That band poster you made is still on the wall. ' : '';
  const cards = returning ? 'the counter and menu cards' : state.config.scenarioId === 'festival-week' ? 'all three festival cards' : 'the cards for three different weeks';
  const conversations = {
    'clem-ten': {
      opening: returning ? `${clemMemory}There’s another photograph in the archive. And a band asking for Thursdays.` : 'The photograph is a little faded. You can still see the room before we knew whether anyone would come.',
      exchanges: [
        { question: 'What should people notice first?', answer: returning ? 'For the archive, the people in the room. For the residency, the band’s name and Thursday. Give each one room to breathe.' : 'If we use the photograph, let people look at it. If we give the band the wall, let their name lead. I don’t need both ideas fighting on one print.' },
        { question: 'What would you keep?', answer: 'The bar’s name must be easy to find. I like the old lettering, but the layout and colours are yours to try.' },
      ],
    },
    'mara-regular': {
      opening: returning ? 'People know where the bakery is now. I want the counter to feel like us. The market stall could use the same care.' : 'Some people ask what’s coming next week before they’ve finished this week’s loaf. That feels like something worth keeping.',
      exchanges: [
        { question: 'What needs to belong together?', answer: `If we choose ${cards}, let them look like a family. The words change from card to card. Keep the colours together.` },
        { question: 'And the market?', answer: 'Someone should recognise Moonrise from the next stall. Put the bakery name and the market place where they can read them. A banner has a different job from a card on the counter.' },
      ],
    },
    'hugo-handover': {
      opening: ivo ? 'I still reach for the drawer where Hugo kept the small screws. Everything is in the same place. The name above the door is the part I’m ready to change.' : 'I’ve spent more time looking down at that bench than looking up at the street. I’m not sure I want a crowd watching me leave it.',
      exchanges: [
        { question: ivo ? 'What should the new sign say?' : 'Would you rather keep it quiet?', answer: ivo ? 'Ivo Watch Workshop. My own name, clearly. Keep the bench in the picture if you like. I don’t need to pretend the place began with me.' : 'A portrait at the bench would be enough. Something to keep. That choice is not an invitation to an open workshop.' },
        { question: ivo ? 'What would you teach?' : 'What would opening the bench mean?', answer: ivo ? 'A first repair. We can invite people to learn it here, with my name on the poster. It would be a small beginning.' : 'Put Ivo’s name on the sign and let people meet the person taking over. If we choose that, the workshop can be a stop on the trail.' },
      ],
    },
    'lantern-night': {
      opening: 'A print gives people a reason to stop. A few finished pieces can give them somewhere to go.',
      exchanges: [
        { question: 'Where should the work bring people?', answer: calendar.careful ? 'One courtyard keeps the work together. Open studios connects the hosts with an invitation and a shared catalogue.' : 'One courtyard gives everyone a common place. A trail lets them follow the work between the hosts. Both need the pieces finished for the same evening.' },
        { question: 'What must stay clear on the print?', answer: `The place, the contributors and Day ${calendar.day + 1}. Only neighbours whose milestone work is finished when we book can contribute. The programme starts production on Day ${calendar.release + 1}.` },
      ],
    },
  };
  const memory = commissionInspiration(state, id);
  const intention = memory ? intentionFor(memory) : undefined;
  const later = project.stage === 'legacy' || project.stage === 'open';
  const recurring = project.stage === 'open';
  const laterConversations = {
    'clem-ten': {
      opening: recurring ? 'The archive has another rotation ready. We can borrow a retained print or make a new display.' : 'People ask who made the prints in the archive. I want the work and its story to stay together.',
      exchanges: [
        { question: 'What happens to a lent print?', answer: 'Choose an exact piece the studio kept. It stays as it was. We need a new caption and invitation beside it.' },
        { question: 'And a new display?', answer: 'Two coordinated prints. Leave room for the archive and keep the visitor information clear. Finished together, they can help with the trail briefings.' },
      ],
    },
    'mara-regular': {
      opening: recurring ? 'Another season at the bakery. We can set one table or open the place to the street.' : 'I can set one shared table, or we can invite people into the bakery. They are different promises.',
      exchanges: [
        { question: 'What does one table need?', answer: 'One invitation. We bring bread to the gathering, but the bakery stays closed.' },
        { question: 'And if the bakery opens?', answer: 'Three matching labels and invitations, ready together. Then we can bring bread and host here too.' },
      ],
    },
    'hugo-handover': {
      opening: recurring ? 'The repair notes need another edition. Or we can invite another class to the bench.' : 'There are repairs I can do without thinking now. Writing them down for someone else takes more care.',
      exchanges: [
        { question: 'What should the reference sheet do?', answer: 'Show the steps clearly enough to use at the bench. It can travel without turning the workshop into a class.' },
        { question: 'What would a class need?', answer: 'An invitation and a demonstration sheet. If both are finished, I can host the class here.' },
      ],
    },
    'lantern-night': conversations['lantern-night'],
  };
  const conversation = later ? laterConversations[id] : conversations[id];
  return { castId: project.castId, name: CAST_BY_ID[project.castId]!.name, ...conversation, opening: intention ? `${later ? "I still have the print you made for us." : intention.response} ${conversation.opening}` : conversation.opening, memory, proposal: intention?.approach };
}
