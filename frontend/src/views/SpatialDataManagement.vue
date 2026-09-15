<template>
  <div class="spatial-page">
    <header>
      <div><span>基础数据 · 管理员维护</span><h1>空间资料管理</h1><p>维护边坡坐标与工程空间图层；发布后的资料才会进入空间态势。</p></div>
      <el-button type="primary" :icon="UploadFilled" @click="importVisible=true">导入空间资料</el-button>
    </header>

    <section class="toolbar">
      <label><span>标段</span><el-select v-model="section" filterable @change="loadAll"><el-option v-for="item in sections" :key="item" :label="item" :value="item" /></el-select></label>
      <div class="quality-note"><b>发布前检查</b><span>坐标系、对象数量、空间范围、重复版本</span></div>
    </section>

    <el-tabs v-model="activeTab" class="workspace">
      <el-tab-pane label="空间图层" name="layers">
        <el-table :data="layers" v-loading="loading" border>
          <el-table-column prop="layer_name" label="图层名称" min-width="180" />
          <el-table-column label="版本" width="76"><template #default="{row}">V{{ row.version_no }}</template></el-table-column>
          <el-table-column prop="source_type" label="资料类型" width="120" />
          <el-table-column prop="coordinate_system" label="坐标系" width="110" />
          <el-table-column prop="feature_count" label="对象数" width="90" align="right" />
          <el-table-column prop="import_note" label="解析与校验结果" min-width="280" show-overflow-tooltip />
          <el-table-column label="状态" width="94"><template #default="{row}"><el-tag :type="statusType(row.status)" effect="plain">{{ statusText(row.status) }}</el-tag></template></el-table-column>
          <el-table-column label="操作" width="160" fixed="right"><template #default="{row}"><el-button v-if="row.status==='draft'" link type="primary" @click="publish(row)">确认发布</el-button><el-button v-if="row.status!=='archived'" link type="danger" @click="archive(row)">归档</el-button></template></el-table-column>
        </el-table>
        <el-empty v-if="!loading&&!layers.length" description="当前标段暂无空间图层，可导入 KML、Shapefile、CAD 或坐标表" />
      </el-tab-pane>

      <el-tab-pane label="边坡坐标" name="slopes">
        <div class="table-tools"><el-input v-model="keyword" :prefix-icon="Search" clearable placeholder="搜索边坡名称或桩号" /></div>
        <el-table :data="visibleSlopes" v-loading="loading" border>
          <el-table-column prop="slope_name" label="边坡名称" min-width="190" />
          <el-table-column label="桩号范围" min-width="190"><template #default="{row}">{{ row.start_stake||'—' }} ～ {{ row.end_stake||'—' }}</template></el-table-column>
          <el-table-column prop="longitude" label="经度" width="140"><template #default="{row}">{{ row.longitude||'—' }}</template></el-table-column>
          <el-table-column prop="latitude" label="纬度" width="140"><template #default="{row}">{{ row.latitude||'—' }}</template></el-table-column>
          <el-table-column prop="coordinate_system" label="坐标系" width="110" />
          <el-table-column label="状态" width="100"><template #default="{row}"><el-tag :type="row.longitude?'success':'warning'" effect="plain">{{ row.longitude?'已定位':'待定位' }}</el-tag></template></el-table-column>
          <el-table-column label="操作" width="100"><template #default="{row}"><el-button link type="primary" @click="editLocation(row)">{{ row.longitude?'校正':'录入' }}</el-button></template></el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="监测点坐标" name="points">
        <div class="table-tools"><el-input v-model="pointKeyword" :prefix-icon="Search" clearable placeholder="搜索测点、类型或所属边坡" /></div>
        <el-table :data="visiblePoints" v-loading="loading" border>
          <el-table-column prop="point_name" label="监测点" min-width="150" />
          <el-table-column prop="point_type" label="监测类型" min-width="150" />
          <el-table-column prop="slope_name" label="所属边坡" min-width="180" />
          <el-table-column prop="longitude" label="经度" width="140"><template #default="{row}">{{ row.longitude||'—' }}</template></el-table-column>
          <el-table-column prop="latitude" label="纬度" width="140"><template #default="{row}">{{ row.latitude||'—' }}</template></el-table-column>
          <el-table-column label="状态" width="100"><template #default="{row}"><el-tag :type="row.longitude?'success':'warning'" effect="plain">{{ row.longitude?'已定位':'待定位' }}</el-tag></template></el-table-column>
          <el-table-column label="操作" width="100"><template #default="{row}"><el-button link type="primary" @click="editPointLocation(row)">{{ row.longitude?'校正':'录入' }}</el-button></template></el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="importVisible" title="导入空间资料" width="620px">
      <el-alert title="文件先进入草稿；确认坐标系、对象数和解析结果后，再发布到空间态势。" type="info" :closable="false" />
      <el-form label-position="top" class="dialog-form">
        <el-form-item label="所属标段"><el-select v-model="importForm.section" filterable><el-option v-for="item in sections" :key="item" :label="item" :value="item" /></el-select></el-form-item>
        <el-form-item label="原始坐标系"><el-select v-model="importForm.coordinate_system"><el-option label="GCJ-02（高德显示）" value="GCJ-02" /><el-option label="WGS84" value="WGS84" /><el-option label="CGCS2000" value="CGCS2000" /><el-option label="工程/地方坐标" value="LOCAL" /></el-select></el-form-item>
        <el-form-item label="空间资料"><el-upload :auto-upload="false" :limit="1" accept=".kml,.kmz,.zip,.dxf,.dwg,.csv,.txt" :on-change="handleFile" :on-remove="()=>file=null"><el-button>选择文件</el-button><template #tip><div class="el-upload__tip">支持 KML/KMZ、Shapefile ZIP、DXF、DWG、CSV 坐标表，最大 100 MB。DWG 将先归档，转换后才能发布。</div></template></el-upload></el-form-item>
      </el-form>
      <template #footer><el-button @click="importVisible=false">取消</el-button><el-button type="primary" :loading="importing" @click="upload">导入草稿</el-button></template>
    </el-dialog>

    <el-dialog v-model="locationVisible" :title="`维护${locationTarget==='point'?'监测点':'边坡'}位置 · ${selected?.point_name||selected?.slope_name||''}`" width="470px">
      <el-form label-position="top" class="dialog-form"><div class="coordinate-grid"><el-form-item label="经度"><el-input-number v-model="location.longitude" :controls="false" :precision="8" /></el-form-item><el-form-item label="纬度"><el-input-number v-model="location.latitude" :controls="false" :precision="8" /></el-form-item></div><el-form-item label="坐标系"><el-select v-model="location.coordinate_system"><el-option label="GCJ-02" value="GCJ-02" /><el-option label="WGS84" value="WGS84" /><el-option label="CGCS2000" value="CGCS2000" /></el-select></el-form-item><el-form-item label="定位精度（米）"><el-input-number v-model="location.accuracy_m" :min="0" :controls="false" /></el-form-item></el-form>
      <template #footer><el-button @click="locationVisible=false">取消</el-button><el-button type="primary" @click="saveLocation">保存位置</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, UploadFilled } from '@element-plus/icons-vue'
import { dataRequest } from '../utils/request'

const section=ref(''),sections=ref([]),layers=ref([]),slopes=ref([]),points=ref([]),loading=ref(false),activeTab=ref('layers'),keyword=ref(''),pointKeyword=ref('')
const importVisible=ref(false),importing=ref(false),file=ref(null),locationVisible=ref(false),selected=ref(null),locationTarget=ref('slope')
const importForm=reactive({section:'',coordinate_system:'GCJ-02'}),location=reactive({longitude:null,latitude:null,coordinate_system:'GCJ-02',accuracy_m:null})
const visibleSlopes=computed(()=>{const q=keyword.value.toLowerCase();return slopes.value.filter(item=>`${item.slope_name||''} ${item.start_stake||''} ${item.end_stake||''}`.toLowerCase().includes(q))})
const visiblePoints=computed(()=>{const slopeMap=new Map(slopes.value.map(item=>[Number(item.id),item.slope_name]));const q=pointKeyword.value.toLowerCase();return points.value.map(item=>({...item,slope_name:slopeMap.get(Number(item.slope_id))||'—'})).filter(item=>`${item.point_name||''} ${item.point_type||''} ${item.slope_name}`.toLowerCase().includes(q))})
const statusText=value=>({draft:'待审核',published:'已发布',archived:'已归档'})[value]||value
const statusType=value=>({draft:'warning',published:'success',archived:'info'})[value]||'info'

async function bootstrap(){const response=await dataRequest('/api/slopes');const all=response.data||[];sections.value=[...new Set(all.map(item=>item.section).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));section.value=sections.value[0]||'';importForm.section=section.value;await loadAll()}
async function loadAll(){if(!section.value)return;loading.value=true;try{const [layerResult,overview]=await Promise.all([dataRequest(`/api/map-overview/layers?section=${encodeURIComponent(section.value)}`),dataRequest(`/api/map-overview/overview?section=${encodeURIComponent(section.value)}`)]);layers.value=layerResult.data||[];slopes.value=overview.data?.slopes||[];points.value=overview.data?.points||[];importForm.section=section.value}catch(error){ElMessage.error(error.message)}finally{loading.value=false}}
function handleFile(value){file.value=value.raw}
async function upload(){if(!file.value)return ElMessage.warning('请选择空间资料文件');importing.value=true;try{const body=new FormData();body.append('file',file.value);body.append('section',importForm.section||section.value);body.append('coordinate_system',importForm.coordinate_system);const result=await dataRequest('/api/map-overview/imports',{method:'POST',body});ElMessage.success(`${result.message}，识别 ${result.data.feature_count} 个对象`);importVisible.value=false;file.value=null;section.value=importForm.section;await loadAll()}catch(error){ElMessage.error(error.message)}finally{importing.value=false}}
async function publish(row){try{await ElMessageBox.confirm(`确认将“${row.layer_name} V${row.version_no}”发布到边坡空间态势？`,'发布空间图层',{type:'warning'});await dataRequest(`/api/map-overview/layers/${row.id}/publish`,{method:'PUT'});ElMessage.success('图层已发布');await loadAll()}catch(error){if(error!=='cancel'&&error!=='close')ElMessage.error(error.message)}}
async function archive(row){try{await ElMessageBox.confirm(`归档后“${row.layer_name}”将不再显示于空间态势。`,'归档空间图层',{type:'warning'});await dataRequest(`/api/map-overview/layers/${row.id}/archive`,{method:'PUT'});ElMessage.success('图层已归档');await loadAll()}catch(error){if(error!=='cancel'&&error!=='close')ElMessage.error(error.message)}}
function fillLocation(row,target){selected.value=row;locationTarget.value=target;Object.assign(location,{longitude:row.longitude==null?null:Number(row.longitude),latitude:row.latitude==null?null:Number(row.latitude),coordinate_system:row.coordinate_system||'GCJ-02',accuracy_m:row.accuracy_m==null?null:Number(row.accuracy_m)});locationVisible.value=true}
function editLocation(row){fillLocation(row,'slope')}
function editPointLocation(row){fillLocation(row,'point')}
async function saveLocation(){if(!Number.isFinite(Number(location.longitude))||!Number.isFinite(Number(location.latitude)))return ElMessage.warning('请输入有效的经纬度');try{const path=locationTarget.value==='point'?`/api/map-overview/points/${selected.value.id}/location`:`/api/map-overview/slopes/${selected.value.id}/location`;await dataRequest(path,{method:'PUT',body:location});ElMessage.success(`${locationTarget.value==='point'?'监测点':'边坡'}位置已保存`);locationVisible.value=false;await loadAll()}catch(error){ElMessage.error(error.message)}}
onMounted(bootstrap)
</script>

<style scoped>
.spatial-page{--ink:#263740;--muted:#71828a;--line:#dce4e7;--blue:#245b7c;min-height:calc(100vh - 52px);padding:22px 28px 48px;background:#f3f6f7;color:var(--ink)}header,.toolbar,.workspace{max-width:1500px;margin-right:auto;margin-left:auto}header{display:flex;align-items:end;justify-content:space-between;margin-bottom:15px}header span{color:var(--blue);font-size:12px;font-weight:700}h1{margin:4px 0;font-size:27px}header p{margin:0;color:var(--muted);font-size:13px}.toolbar{display:flex;align-items:end;justify-content:space-between;padding:13px 16px;border:1px solid var(--line);background:#fff}.toolbar label{display:flex;width:260px;flex-direction:column;gap:6px}.toolbar label>span{font-size:12px;font-weight:600}.quality-note{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12px}.quality-note b{color:var(--blue)}.workspace{margin-top:12px;padding:5px 18px 18px;border:1px solid var(--line);background:#fff}.table-tools{display:flex;justify-content:flex-end;margin-bottom:10px}.table-tools .el-input{width:300px}.dialog-form{margin-top:18px}.dialog-form :deep(.el-select),.dialog-form :deep(.el-input-number){width:100%}.coordinate-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:720px){.spatial-page{padding:14px}header,.toolbar{align-items:start;flex-direction:column;gap:12px}.toolbar label{width:100%}.quality-note{align-items:start;flex-direction:column}.coordinate-grid{grid-template-columns:1fr}}
</style>
