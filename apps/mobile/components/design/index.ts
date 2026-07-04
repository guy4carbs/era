/** Outfit-canvas + Design-tab components and API. */
export { OutfitCanvas } from './OutfitCanvas';
export { OutfitCard } from './OutfitCard';
export { EraSection } from './EraSection';
export { Collage } from './Collage';
export {
  addOutfitToEra,
  createEra,
  createOutfit,
  fetchEras,
  fetchOutfitDetail,
  fetchOutfits,
  requestCoverUpload,
  updateOutfit,
  uploadCover,
  type EraSummary,
  type OutfitDetail,
  type OutfitItemTransform,
  type OutfitSavePayload,
  type OutfitSummary,
} from './api';
