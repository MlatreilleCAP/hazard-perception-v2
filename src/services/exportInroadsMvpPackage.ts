import {
  buildImportFolderZip,
  buildSampleImportTemplateZip,
} from '@/lib/inroadsMvp/buildImportTemplate'

export async function exportInroadsMvpTemplateZip(_parentId?: string): Promise<Blob> {
  return buildImportFolderZip()
}

export async function exportSampleInroadsMvpTemplateZip(): Promise<Blob> {
  return buildSampleImportTemplateZip()
}
