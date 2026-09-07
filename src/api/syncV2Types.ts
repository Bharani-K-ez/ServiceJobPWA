/**
 * Client-side shape of ezServiceHUB.Domain.ApiResponse.SyncV2Response and
 * friends, AFTER httpClient's response interceptor has lower-cased the
 * first letter of every key (see httpClient.ts's toCamelCase). Note this
 * only lowercases the first character, so e.g. `SerRecID` becomes
 * `serRecID` (capital ID preserved), not `serRecId`.
 */
export interface SyncV2JobDto {
  serRecID: number
  docketRef: string | null
  siteID: number | null
  callReceivedDT: string | null
  probDesc: string | null
  startDT: string | null
  finishDT: string | null
  status: string | null
  completed: boolean
  serviceType: string | null
  description: string | null
  datePromisedDT: string | null
  timeFrame: string | null
  scheduledDate: string | null
  scheduledEndDate: string | null
  callerName: string | null
  jobNumber: number | null
  priority: number | null
  dispatchEng: string | null
  dispatchStatus: string | null
  dispatchStatusDesc: string | null
  system: string | null
  timeEst: number
}

export interface SyncV2SiteDto {
  siteID: number
  siteRef: string | null
  occupant: string | null
  address: string | null
  town: string | null
  county: string | null
  areaCode: string | null
  postCode: string | null
  telephone: string | null
  custID: number | null
  panelLocation: string | null
  note: string | null
  latitude: number | null
  longitude: number | null
}

export interface SyncV2CustomerDto {
  custID: number
  organizationName: string | null
  firstName: string | null
  lastName: string | null
  address: string | null
  town: string | null
  county: string | null
  homePhone: string | null
  mobilePhone: string | null
  workPhone: string | null
  emailAddress: string | null
  accountsRef: string | null
}

export interface SyncV2AssetDto {
  assetGuid: string
  assetName: string | null
  assetType: number | null
  siteID: number | null
  assetModel: string | null
  assetDesc: string | null
  serialNo: string | null
  number: string | null
  location: string | null
  lastServiceDate: string | null
  nextServiceDate: string | null
  isActive: boolean
  /** Links to SyncV2CommonCategoryDto.templateId - which form this asset uses. */
  templateId: number | null
}

/**
 * One "form" definition for the dynamic Asset Service information screen -
 * matched to assets via templateId. Pure reference/config data.
 */
export interface SyncV2CommonCategoryDto {
  categoryId: number
  type: number | null
  name: string | null
  propCount: number | null
  templateId: number | null
  templateType: string | null
}

/**
 * One dynamic field definition within a category/form. categoryType 0 =
 * header field (single value per asset), 1 = detail/grid field (many rows
 * per asset). propColRefNo (1-50) says which AssetProperties value{N} this
 * field's value lives in. ctrlProps holds Select options as JSON, e.g.
 * `[{"value":""},{"value":"Yes"}]`.
 */
export interface SyncV2CommonCategoryPropDto {
  propsId: number
  categoryId: number
  categoryType: number | null
  name: string | null
  ctrlType: string | null
  ctrlWidth: number | null
  ctrlOrder: number | null
  ctrlisMandatory: boolean | null
  ctrlDefaultVal: string | null
  ctrlProps: string | null
  propColRefNo: number | null
  code: string | null
}

/** One row of captured dynamic values for an asset - see AssetValueMap for the value1..value50 access helper. */
export interface SyncV2AssetPropertyDto {
  assetPropId: number
  assetGuid: string
  assetDetailGuid: string | null
  type: number | null
  value1: string | null
  value2: string | null
  value3: string | null
  value4: string | null
  value5: string | null
  value6: string | null
  value7: string | null
  value8: string | null
  value9: string | null
  value10: string | null
  value11: string | null
  value12: string | null
  value13: string | null
  value14: string | null
  value15: string | null
  value16: string | null
  value17: string | null
  value18: string | null
  value19: string | null
  value20: string | null
  value21: string | null
  value22: string | null
  value23: string | null
  value24: string | null
  value25: string | null
  value26: string | null
  value27: string | null
  value28: string | null
  value29: string | null
  value30: string | null
  value31: string | null
  value32: string | null
  value33: string | null
  value34: string | null
  value35: string | null
  value36: string | null
  value37: string | null
  value38: string | null
  value39: string | null
  value40: string | null
  value41: string | null
  value42: string | null
  value43: string | null
  value44: string | null
  value45: string | null
  value46: string | null
  value47: string | null
  value48: string | null
  value49: string | null
  value50: string | null
  assetServiceGuid: string | null
}

export interface SyncV2ResponseDto {
  jobs: SyncV2JobDto[]
  sites: SyncV2SiteDto[]
  customers: SyncV2CustomerDto[]
  assets: SyncV2AssetDto[]
  commonCategories: SyncV2CommonCategoryDto[]
  commonCategoryProps: SyncV2CommonCategoryPropDto[]
  assetProperties: SyncV2AssetPropertyDto[]
}
