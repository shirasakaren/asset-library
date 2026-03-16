import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Raw per-version analysis dump. The Postgres `AssetVersion.manifest` carries
 * the queryable / indexed slice; everything else (full per-file metadata,
 * Blender output, etc.) lands here for debugging + future reanalysis.
 */
@Schema({ collection: 'analysis_reports', timestamps: true })
export class AnalysisReport extends Document {
  @Prop({ unique: true, index: true }) versionId!: string;
  @Prop({ type: Object }) manifest!: Record<string, unknown>;
  @Prop({ type: Object }) perFile!: Record<string, unknown>;
  @Prop() builtAt!: Date;
}

export const AnalysisReportSchema = SchemaFactory.createForClass(AnalysisReport);
