import { mergePortalEvidence } from './portal-ecosystem.js'
import { mergeNetworkHistory } from './network-history.js'
import { applyFundHierarchy, foldFundNodes, financialNodePies } from './fund-pies.js'
import { networkPreviewSummaries } from './ecosystem-view.js'
onmessage=({data:{base,directory,records,history}})=>{
 try {
  const data=applyFundHierarchy(mergeNetworkHistory(mergePortalEvidence(base,directory,records),history))
  postMessage({data,summaries:networkPreviewSummaries(data),folded:foldFundNodes(data),contextPies:financialNodePies(data,{includeCapitalization:true})})
 } catch(error) {postMessage({error:error.message})}
}
