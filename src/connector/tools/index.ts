/* Every tool of the connector, in the order tools/list shows them (one module per tool: its definition and its handler). */
import type { Tool } from '../tool.ts';
import { tool as whoami } from './whoami.ts';
import { tool as authoringGuide } from './authoring_guide.ts';
import { tool as getToolkit } from './get_toolkit.ts';
import { tool as listSubjects } from './list_subjects.ts';
import { tool as getPackUrl } from './get_pack_url.ts';
import { tool as startUpload } from './start_upload.ts';
import { tool as startSourceUpload } from './start_source_upload.ts';
import { tool as finishUpload } from './finish_upload.ts';
import { tool as savePack } from './save_pack.ts';
import { tool as pipeline } from './pipeline.ts';
import { tool as bridgeGuide } from './bridge_guide.ts';
import { tool as saveBridge } from './save_bridge.ts';
import { tool as saveTranslation } from './save_translation.ts';
import { tool as saveRoadmapTranslation } from './save_roadmap_translation.ts';
import { tool as imageSearch } from './image_search.ts';
import { tool as imageFetch } from './image_fetch.ts';
import { tool as curricula } from './curricula.ts';
import { tool as createRoadmap } from './create_roadmap.ts';
import { tool as roadmapMap } from './roadmap_map.ts';
import { tool as extendRoadmap } from './extend_roadmap.ts';
import { tool as linkRoadmapSteps } from './link_roadmap_steps.ts';
import { tool as restructureLevels } from './restructure_levels.ts';
import { tool as curriculumTask } from './curriculum_task.ts';
import { tool as langCourses } from './lang_courses.ts';
import { tool as langTask } from './lang_task.ts';
import { tool as langSubmit } from './lang_submit.ts';
import { tool as languagePackageGuide } from './language_package_guide.ts';
import { tool as langPackageStart } from './lang_package_start.ts';
import { tool as langPackageFinish } from './lang_package_finish.ts';
import { tool as vaultFieldsQueue } from './vault_fields_queue.ts';
import { tool as vaultFieldsFind } from './vault_fields_find.ts';
import { tool as vaultFieldsSave } from './vault_fields_save.ts';
import { tool as reports } from './reports.ts';
import { tool as report } from './report.ts';
import { tool as reportUpdate } from './report_update.ts';
import { tool as requestEngine } from './request_engine.ts';
import { tool as engineRequests } from './engine_requests.ts';
import { tool as engineRequestUpdate } from './engine_request_update.ts';
import { tool as curriculumSubmit } from './curriculum_submit.ts';

export const TOOLS: readonly Tool[] = [
  whoami,
  authoringGuide,
  getToolkit,
  listSubjects,
  getPackUrl,
  startUpload,
  startSourceUpload,
  finishUpload,
  savePack,
  pipeline,
  bridgeGuide,
  saveBridge,
  saveTranslation,
  saveRoadmapTranslation,
  imageSearch,
  imageFetch,
  curricula,
  createRoadmap,
  roadmapMap,
  extendRoadmap,
  linkRoadmapSteps,
  restructureLevels,
  curriculumTask,
  langCourses,
  langTask,
  langSubmit,
  languagePackageGuide,
  langPackageStart,
  langPackageFinish,
  vaultFieldsQueue,
  vaultFieldsFind,
  vaultFieldsSave,
  reports,
  report,
  reportUpdate,
  requestEngine,
  engineRequests,
  engineRequestUpdate,
  curriculumSubmit,
];
